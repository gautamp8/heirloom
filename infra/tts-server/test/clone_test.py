"""Smoke test: load LuxTTS, clone the reference, synthesize a Sagan line."""

import time
import torch
from zipvoice.luxvoice import LuxTTS
import soundfile as sf

REF_AUDIO = "test/reference.wav"
OUT_PATH = "test/cloned.wav"
TEXT = (
    "Look again at that dot. That's here. That's home. That's us. "
    "On it everyone you love, everyone you know, everyone you ever heard of, "
    "every human being who ever was, lived out their lives."
)

device = "mps" if torch.backends.mps.is_available() else "cpu"
print(f"[boot] device={device}")

t0 = time.time()
model = LuxTTS(model_path="YatharthS/LuxTTS", device=device)
print(f"[load] {time.time() - t0:.1f}s")

t1 = time.time()
encoded = model.encode_prompt(prompt_audio=REF_AUDIO, duration=5, rms=0.01)
print(f"[encode] {time.time() - t1:.1f}s")

t2 = time.time()
wav = model.generate_speech(
    text=TEXT,
    encode_dict=encoded,
    num_steps=4,
    guidance_scale=3.0,
    t_shift=0.5,
    speed=1.0,
    return_smooth=False,
)
print(f"[generate] {time.time() - t2:.1f}s")

if isinstance(wav, torch.Tensor):
    wav = wav.cpu().numpy()
if wav.ndim > 1:
    wav = wav.squeeze()

sf.write(OUT_PATH, wav, 48000)
print(f"[write] -> {OUT_PATH} ({len(wav) / 48000:.1f}s of audio)")
