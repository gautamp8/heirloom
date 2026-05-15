"""
Heirloom TTS sidecar - LuxTTS (ZipVoice) voice clone server.

A minimal HTTP wrapper around LuxTTS. Two endpoints:

  POST /encode    multipart wav -> {voice_id}   (caches the encoded prompt)
  POST /speak     {voice_id, text} -> audio/wav

Voice prompts are cached in-memory keyed by voice_id; on restart they're
re-encoded on first request. The reference wav lives on disk and is
addressed by voice_id.
"""

from __future__ import annotations

import asyncio
import hashlib
import io
import logging
import os
import threading
import time
from pathlib import Path
from typing import Optional

import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("heirloom-tts")

VOICE_DIR = Path(os.environ.get("HEIRLOOM_VOICE_DIR", "voice"))
VOICE_DIR.mkdir(parents=True, exist_ok=True)


def _device() -> str:
    return "mps" if torch.backends.mps.is_available() else "cpu"


class TTSEngine:
    """LuxTTS lazy-loaded singleton, thread-safe prompt cache."""

    def __init__(self) -> None:
        self._model = None
        self._lock = threading.Lock()
        self._prompt_cache: dict[str, dict] = {}

    def _ensure_loaded(self) -> None:
        if self._model is not None:
            return
        with self._lock:
            if self._model is not None:
                return
            from zipvoice.luxvoice import LuxTTS

            t0 = time.time()
            self._model = LuxTTS(model_path="YatharthS/LuxTTS", device=_device())
            log.info("LuxTTS loaded on %s in %.1fs", _device(), time.time() - t0)

    def encode(self, voice_id: str, audio_path: Path) -> None:
        self._ensure_loaded()
        if voice_id in self._prompt_cache:
            return
        t0 = time.time()
        encoded = self._model.encode_prompt(
            prompt_audio=str(audio_path),
            duration=5,
            rms=0.01,
        )
        self._prompt_cache[voice_id] = encoded
        log.info("encoded voice=%s in %.1fs", voice_id, time.time() - t0)

    def speak(self, voice_id: str, text: str) -> tuple[np.ndarray, int]:
        if voice_id not in self._prompt_cache:
            wav_path = VOICE_DIR / f"{voice_id}.wav"
            if not wav_path.exists():
                raise FileNotFoundError(f"unknown voice_id: {voice_id}")
            self.encode(voice_id, wav_path)

        self._ensure_loaded()
        t0 = time.time()
        wav = self._model.generate_speech(
            text=text,
            encode_dict=self._prompt_cache[voice_id],
            num_steps=4,
            guidance_scale=3.0,
            t_shift=0.5,
            speed=1.0,
            return_smooth=False,
        )
        if isinstance(wav, torch.Tensor):
            wav = wav.cpu().numpy()
        if wav.ndim > 1:
            wav = wav.squeeze()
        log.info(
            "synth voice=%s len=%.1fs in %.1fs",
            voice_id,
            len(wav) / 48000,
            time.time() - t0,
        )
        return wav, 48000


engine = TTSEngine()
app = FastAPI(title="Heirloom TTS")


class SpeakRequest(BaseModel):
    voice_id: str
    text: str


@app.get("/healthz")
def healthz() -> dict:
    return {
        "ok": True,
        "device": _device(),
        "loaded": engine._model is not None,
        "voices_cached": list(engine._prompt_cache.keys()),
    }


@app.post("/encode")
async def encode(audio: UploadFile = File(...), voice_id: Optional[str] = Form(None)) -> dict:
    """Store a reference WAV and return its voice_id.

    If `voice_id` is omitted we derive it from the audio bytes' SHA-256.
    Subsequent /speak calls reuse this id.
    """
    data = await audio.read()
    if not voice_id:
        voice_id = hashlib.sha256(data).hexdigest()[:24]

    wav_path = VOICE_DIR / f"{voice_id}.wav"
    wav_path.write_bytes(data)

    # Encode synchronously so callers know it's cached when they get the id back.
    await asyncio.to_thread(engine.encode, voice_id, wav_path)

    info = sf.info(str(wav_path))
    return {
        "voice_id": voice_id,
        "duration_seconds": info.duration,
        "sample_rate": info.samplerate,
    }


@app.post("/speak")
async def speak(req: SpeakRequest):
    try:
        wav, sr = await asyncio.to_thread(engine.speak, req.voice_id, req.text)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))
    buf = io.BytesIO()
    sf.write(buf, wav, sr, format="WAV")
    buf.seek(0)
    return StreamingResponse(buf, media_type="audio/wav")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host=os.environ.get("HEIRLOOM_TTS_HOST", "127.0.0.1"),
        port=int(os.environ.get("HEIRLOOM_TTS_PORT", "11435")),
        log_level="info",
    )
