#!/usr/bin/env python3
"""
Voice-clone tuning sweep — generates labeled samples across the synthesis
settings so the WS3 listening comparison is a one-command, blind-ish A/B.

Run it inside the LuxTTS venv (the one install-tts.sh builds), pointing at
one or more reference wavs (8-30s of a real voice reading the on-screen
script). It clones each voice and synthesizes a fixed test sentence at
several num_steps / guidance / return_smooth settings, writing to
./sweep-out/<voice>/<label>.wav plus a latency table.

    python sweep.py path/to/ref1.wav path/to/ref2.wav

Then listen through ./sweep-out/ and pick the setting that sounds most
like the person without artifacts. Put the winner in HEIRLOOM_TTS_STEPS /
HEIRLOOM_TTS_GUIDANCE / HEIRLOOM_TTS_SMOOTH (see server.py). Desktop can
afford more steps than it currently uses; this finds how many actually
help before the returns flatten.
"""

import sys
import time
from pathlib import Path

import soundfile as sf
import torch

# The same model class the server uses — see server.py's _ensure_loaded.
# (An earlier version imported `luxtts`, which does not exist in the
# venv install-tts.sh builds; the package is `zipvoice`, so the sweep
# could never actually run.)
from zipvoice.luxvoice import LuxTTS  # type: ignore

TEST_TEXT = (
    "Look after each other. Say the kind thing out loud while you can. "
    "And when you miss me, put the kettle on and read something good."
)

# (label, num_steps, guidance, return_smooth)
SETTINGS = [
    ("steps08_g3.0", 8, 3.0, False),
    ("steps16_g3.0", 16, 3.0, False),
    ("steps24_g3.0", 24, 3.0, False),
    ("steps32_g3.0", 32, 3.0, False),
    ("steps16_g2.0", 16, 2.0, False),
    ("steps16_g4.0", 16, 4.0, False),
    ("steps16_g3.0_smooth", 16, 3.0, True),
]


def main() -> None:
    refs = [Path(p) for p in sys.argv[1:]]
    if not refs:
        print("usage: python sweep.py <ref1.wav> [ref2.wav ...]")
        sys.exit(1)

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    print(f"loading LuxTTS on {device} ...")
    model = LuxTTS(model_path="YatharthS/LuxTTS", device=device)

    out_root = Path("sweep-out")
    out_root.mkdir(exist_ok=True)
    rows: list[str] = ["voice,label,steps,guidance,smooth,seconds,synth_ms"]

    for ref in refs:
        name = ref.stem
        vdir = out_root / name
        vdir.mkdir(parents=True, exist_ok=True)
        print(f"\n== {name} ==")
        # Encode the prompt once (server caps at 15s; match that).
        info = sf.info(str(ref))
        prompt_seconds = max(3.0, min(15.0, info.duration))
        encode_dict = model.encode_prompt(
            prompt_audio=str(ref), duration=prompt_seconds, rms=0.01
        )
        for label, steps, guidance, smooth in SETTINGS:
            t0 = time.time()
            wav = model.generate_speech(
                text=TEST_TEXT,
                encode_dict=encode_dict,
                num_steps=steps,
                guidance_scale=guidance,
                t_shift=0.5,
                speed=1.0,
                return_smooth=smooth,
            )
            dt = (time.time() - t0) * 1000
            if isinstance(wav, torch.Tensor):
                wav = wav.cpu().numpy()
            if wav.ndim > 1:
                wav = wav.squeeze()
            sf.write(str(vdir / f"{label}.wav"), wav, 48000, format="WAV")
            secs = len(wav) / 48000
            rows.append(
                f"{name},{label},{steps},{guidance},{smooth},{secs:.1f},{dt:.0f}"
            )
            print(f"  {label:22s} {dt:6.0f} ms  ({secs:.1f}s audio)")

    (out_root / "latency.csv").write_text("\n".join(rows) + "\n")
    print(f"\nwrote {out_root}/  — listen and pick a winner, latency in latency.csv")


if __name__ == "__main__":
    main()
