# Voice-clone tuning sweep — results, and the listening step

WS3 asks for a baseline across reference voices, then a tuning sweep with
a measured latency/quality curve, then **[HUMAN]** a listening call on
which setting wins. The sweep has been run. The latency half is settled
below; the quality half needs ears.

## What was run

`infra/tts-server/sweep.py` against the four reference recordings in
`infra/tts-server/voice/`, on Apple silicon (MPS). Each voice is cloned
once, then the same sentence is synthesized at seven settings — 28
samples in all, written to `infra/tts-server/sweep-out/<voice>/<label>.wav`
with `latency.csv` beside them. They are deliberately **not committed**
(19 MB of generated audio; the repo already had a hygiene problem with
checked-in WAVs).

To regenerate:

```bash
# once: ~2 GB, builds the LuxTTS venv under Application Support
desktop/scripts/install-tts.sh

cd infra/tts-server
"$HOME/Library/Application Support/Heirloom/tts/venv/bin/python" sweep.py \
  voice/*.wav
```

> The sweep never actually ran before this: it imported `from luxtts
> import LuxTTS`, but the venv installs the `zipvoice` package and the
> server imports `from zipvoice.luxvoice import LuxTTS`. It also built
> the model without `model_path` and encoded prompts without `rms=0.01`,
> so its output would not have matched production even had it started.
> All three are fixed, and the installer's smoke test now checks the
> model import rather than only torch/fastapi/soundfile.

## Latency curve (measured)

Median over the three warm voices — the first voice is dropped because it
carries model load. Test line is 7.5 s of speech.

| setting | median synth | × realtime | cost vs 8 steps |
|---|---|---|---|
| 8 steps, guidance 3.0 *(current default)* | 2262 ms | 0.30× | 1.00× |
| **16 steps, guidance 3.0** | 2808 ms | 0.37× | 1.24× |
| 24 steps, guidance 3.0 | 4149 ms | 0.55× | 1.83× |
| 32 steps, guidance 3.0 | 5505 ms | 0.73× | 2.43× |
| 16 steps, guidance 2.0 | 2794 ms | 0.37× | 1.24× |
| 16 steps, guidance 4.0 | 2796 ms | 0.37× | 1.24× |
| 16 steps, guidance 3.0, smooth | 2798 ms | 0.37× | 1.24× |

**What this settles.** Every setting, including 32 steps, synthesizes
faster than the audio plays. Even the slowest renders a 7.5 s line in
5.5 s, so raising step count never makes someone wait longer than the
sentence itself — and playback is a one-shot per capture, not a stream.
The 8-step default was chosen for a demo VM that no longer exists; on the
desktop, which is the only place voice runs, there is headroom to spend.

Guidance and `return_smooth` cost nothing measurable (all three 16-step
variants land within 14 ms of each other), so they are free quality
knobs — pick them purely on how they sound.

## The listening step **[HUMAN]**

Play `sweep-out/<voice>/` through and pick the one that sounds most like
the person without artifacts. Suggested order: compare `steps08_g3.0`
against `steps16_g3.0` first — if 16 is audibly better, try 24, and stop
when the difference stops being obvious. Then, at whichever step count
won, compare `g2.0` / `g3.0` / `g4.0` and the `_smooth` variant.

Apply the winner with environment variables — no code change:

```bash
HEIRLOOM_TTS_STEPS=16
HEIRLOOM_TTS_GUIDANCE=3.0
HEIRLOOM_TTS_SMOOTH=0     # 1 to enable the post-filter
```

They are read in `infra/tts-server/server.py`. If 16 or 24 wins, change
the default there so the desktop build ships it.
