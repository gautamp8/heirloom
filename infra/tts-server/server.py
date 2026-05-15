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
CACHE_DIR = VOICE_DIR / "cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)


def _device() -> str:
    return "mps" if torch.backends.mps.is_available() else "cpu"


def _sanitize_for_tts(text: str) -> str:
    """Calm the prosody. Flow-matching TTS over-emphasises lone bangs,
    ellipses, and shouty caps; the verbatim contract is about the words,
    not the punctuation, so we normalise it before synthesis."""
    import re
    t = text.strip()
    # Drop trailing dramatic punctuation: !!! -> ., !? -> ., !!! -> .
    t = re.sub(r"[!?]{2,}", ".", t)
    # Single exclamation -> period (keeps the sentence but kills the shout)
    t = t.replace("!", ".")
    # Ellipses to a single beat
    t = re.sub(r"\.\.\.+|…", ".", t)
    # Curly quotes normalised
    t = t.replace("“", '"').replace("”", '"')
    t = t.replace("‘", "'").replace("’", "'")
    # ALL-CAPS WORDS softened (preserve normal cased proper nouns)
    def _decap(m: "re.Match[str]") -> str:
        w = m.group(0)
        return w if len(w) <= 2 else w.capitalize()
    t = re.sub(r"\b[A-Z]{3,}\b", _decap, t)
    # Collapse repeated whitespace
    t = re.sub(r"\s+", " ", t).strip()
    return t


def _seed_for(voice_id: str, text: str) -> int:
    """Deterministic seed so repeated synthesis of the same line is
    bit-identical to the first run. Mod by 2^31 to fit torch's int range."""
    h = hashlib.sha256(f"{voice_id}|{text}".encode("utf-8")).digest()
    return int.from_bytes(h[:4], "big") & 0x7FFFFFFF


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
        # LuxTTS recommends ~15s of prompt as the upper bound for best
        # performance; shorter prompts (≤5s) drift to a generic voice on
        # any synthesised utterance longer than ~6s. Use up to 15s of
        # whatever the user actually recorded.
        info = sf.info(str(audio_path))
        prompt_seconds = max(3.0, min(15.0, info.duration))
        encoded = self._model.encode_prompt(
            prompt_audio=str(audio_path),
            duration=prompt_seconds,
            rms=0.01,
        )
        self._prompt_cache[voice_id] = encoded
        log.info(
            "encoded voice=%s prompt=%.1fs in %.1fs",
            voice_id,
            prompt_seconds,
            time.time() - t0,
        )

    def speak(self, voice_id: str, text: str) -> tuple[np.ndarray, int]:
        clean = _sanitize_for_tts(text)
        seed = _seed_for(voice_id, clean)
        cache_path = CACHE_DIR / f"{voice_id}_{seed:08x}.wav"
        if cache_path.exists():
            wav, sr = sf.read(str(cache_path), dtype="float32")
            log.info("synth cache hit voice=%s seed=%08x", voice_id, seed)
            return wav, sr

        if voice_id not in self._prompt_cache:
            wav_path = VOICE_DIR / f"{voice_id}.wav"
            if not wav_path.exists():
                raise FileNotFoundError(f"unknown voice_id: {voice_id}")
            self.encode(voice_id, wav_path)

        self._ensure_loaded()
        t0 = time.time()
        # Deterministic flow-matching: same seed -> identical waveform.
        torch.manual_seed(seed)
        if torch.backends.mps.is_available():
            torch.mps.manual_seed(seed)
        np.random.seed(seed & 0xFFFFFFFF)
        wav = self._model.generate_speech(
            text=clean,
            encode_dict=self._prompt_cache[voice_id],
            num_steps=8,
            guidance_scale=3.0,
            t_shift=0.5,
            speed=1.0,
            return_smooth=False,
        )
        if isinstance(wav, torch.Tensor):
            wav = wav.cpu().numpy()
        if wav.ndim > 1:
            wav = wav.squeeze()
        sf.write(str(cache_path), wav, 48000, format="WAV")
        log.info(
            "synth voice=%s len=%.1fs in %.1fs seed=%08x (cached)",
            voice_id,
            len(wav) / 48000,
            time.time() - t0,
            seed,
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
