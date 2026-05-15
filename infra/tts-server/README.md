# Heirloom TTS sidecar

A minimal FastAPI server wrapping LuxTTS (ZipVoice) for zero-shot voice
cloning. Heirloom's Next.js app forwards `/api/voice/clone` and
`/api/voice/speak` here.

## Endpoints

- `POST /encode` - multipart `audio` (wav) + optional `voice_id`. Stores
  the wav under `$HEIRLOOM_VOICE_DIR/<voice_id>.wav` and warms the
  in-memory prompt cache. Returns `{voice_id, duration_seconds, sample_rate}`.
- `POST /speak` - `{voice_id, text}` → `audio/wav` stream. Re-encodes
  from disk if the prompt isn't cached.
- `GET /healthz` - `{ok, device, loaded, voices_cached}`.

## Install (Apple Silicon)

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install --find-links https://k2-fsa.github.io/icefall/piper_phonemize.html piper-phonemize
pip install "git+https://github.com/ysharma3501/LinaCodec.git"
pip install "git+https://github.com/ysharma3501/LuxTTS.git"
```

## Run

```bash
HEIRLOOM_VOICE_DIR=~/Library/Application\ Support/Heirloom/voice \
HEIRLOOM_TTS_HOST=127.0.0.1 \
HEIRLOOM_TTS_PORT=11435 \
python server.py
```

First synthesis pays a ~25 s model-load cost; subsequent requests are
~3× realtime on Apple Silicon (MPS) and ~1× realtime on 8 CPU cores.

## Memory

Roughly 1.0 GB resident for the model weights + 300 MB Python runtime.
Vocoder activations and audio buffers add another ~500 MB transient.
