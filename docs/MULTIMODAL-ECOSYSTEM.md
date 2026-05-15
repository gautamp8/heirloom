# Heirloom - Gemma 4 multimodal ecosystem notes

This document captures what we learned wiring Gemma 4 multimodal end-to-end
through Heirloom's local-first stack, and the gaps we hit along the way.
It's intended as a contribution to the broader Ollama / llama.cpp / Gemma
community.

## What works today via Ollama

`gemma4:e4b` (8B params, 9.6 GB GGUF) declares the following capabilities
in its Ollama manifest:

```
$ ollama show gemma4:e4b
  Capabilities
    completion
    vision      ← image inputs via /api/chat { messages[].images: [base64] }
    audio       ← *declared but not routable via /api/chat - see below*
    tools       ← native function calling
    thinking    ← reasoning mode (toggled via `think: true/false`)
```

Heirloom uses Ollama for everything that does work:

| Surface | Model | Endpoint |
|---|---|---|
| Text synthesis (Reflection, titles, prompts) | `gemma4:e4b` | `/api/chat` |
| Vision captioning (photos) | `gemma4:e4b` | `/api/chat` with `images: [b64]` |
| Embeddings (text + caption) | `embeddinggemma:300m` | `/api/embed` |
| Custom grounded variant | `heirloom/gemma4-grounded` | published Modelfile |

Vision is fast on Apple Silicon: **~1.7s warm, ~7.5s cold** for a single
image with `think: false` and `num_predict: 180`. The `think: true` path
produces a separate chain-of-thought in `message.thinking` plus a shorter
final caption in `message.content`.

## The gap: audio input via Ollama

`ollama show gemma4:e4b` advertises `audio` as a capability, but the HTTP
API doesn't expose an audio field. We empirically verified three plausible
payload shapes:

```jsonc
// 1. images-key (model thinks it's an image)
{ "messages": [{ "role": "user", "content": "...", "images": [<audio b64>] }] }
// → model hallucinates an image caption ("It's falling on my head.")

// 2. audios-key
{ "messages": [{ "role": "user", "content": "...", "audios": [<audio b64>] }] }
// → "I'm sorry, but you have not provided any audio for me to transcribe."

// 3. audio-key (singular)
{ "messages": [{ "role": "user", "content": "...", "audio": [<audio b64>] }] }
// → same "no audio provided" response
```

The Ollama community thread tracking this is
**[ollama/ollama#11798](https://github.com/ollama/ollama/issues/11798)**.

### Looking deeper: the projector layer is missing

The Gemma 4 multimodal architecture follows the standard pattern - an audio
encoder + projector module that maps audio embeddings into the language
model's embedding space. The projector ships as a separate GGUF (`-mmproj`
flag in llama.cpp's `llama-server`).

Inspecting the manifest of the model we have:

```
$ cat ~/.ollama/models/manifests/registry.ollama.ai/library/gemma4/e4b
  layers:
    application/vnd.ollama.image.model    9.6 GB  ← main weights
    application/vnd.ollama.image.license  11 KB
    application/vnd.ollama.image.params   42 B
```

**No `application/vnd.ollama.image.projector` (or similar) layer.** The audio
modality cannot be exercised even by bypassing Ollama and running llama.cpp
directly against these blobs - the projector simply isn't published.

(Vision works because, in this build of Gemma 4, the vision projector
appears to be embedded in the main model file rather than a separate layer.)

## Heirloom's runtime split

Until the audio modality can be exercised, Heirloom routes audio through
**whisper-cpp small.en** instead:

```
Heirloom backend
├── ollama serve         :11434    ← text + vision + embeddings
└── whisper-cli                    ← audio → transcript (subprocess)
```

When the Gemma 4 audio projector is published, the planned architecture
adds a `llama-server` sidecar serving the same GGUF + audio projector,
addressing audio understanding directly without leaving the local stack:

```
Heirloom backend
├── ollama serve         :11434    ← text + vision + embeddings (today)
├── llama-server         :8080     ← audio understanding (future)
│                                    once `gemma4-e4b-audio-mmproj.gguf`
│                                    is published
└── whisper-cli                    ← fallback / belt-and-suspenders
```

The pipeline (`src/lib/pipeline.ts`) is structured so the audio branch can
flip from whisper to llama-server by changing one function pointer.

## Reference config - when the audio projector ships

When the audio projector becomes available, the bridge is:

```bash
# 1. Pull or build the audio projector (placeholder filename)
ollama pull google/gemma4-e4b-audio-mmproj  # or hf-hub-download equivalent

# 2. Extract the GGUF paths from Ollama's blob store
MODEL_GGUF=~/.ollama/models/blobs/sha256-4c27e0f5b5adf02ac956c7322bd2ee7636fe3f45a8512c9aba5385242cb6e09a
MMPROJ_GGUF=<wherever the audio projector lands>

# 3. Run llama-server with audio enabled
llama-server \
    --model "$MODEL_GGUF" \
    --mmproj "$MMPROJ_GGUF" \
    --port 8080 \
    --ctx-size 8192 \
    --threads 8

# 4. POST audio + question via OpenAI-compatible /v1/chat/completions
curl -s http://localhost:8080/v1/chat/completions -d '{
  "model": "gemma4-e4b",
  "messages": [{
    "role": "user",
    "content": [
      { "type": "audio_input", "audio_data": "<base64 wav>" },
      { "type": "text", "text": "Transcribe this audio verbatim." }
    ]
  }]
}'
```

## Benchmark surface (running, awaiting audio projector)

Heirloom carries a 25-recording seed corpus we'll use to benchmark
**whisper-cpp small.en** against **Gemma 4 audio** the moment the audio
projector is reachable. The metrics we'll publish:

| Metric | Whisper small.en | Gemma 4 audio (target) |
|---|---|---|
| Word Error Rate (WER) | tbd | tbd |
| Mean transcription time per 30s clip | tbd | tbd |
| Speaker-emotion classification accuracy | n/a | tbd |
| Per-token latency | n/a | tbd |
| Model download size | 142 MB | 9.6 GB (shared with text) |

(See `tests/benchmarks/audio.ts` placeholder.)

## What we propose upstream

A proposed concrete API shape for Ollama
[#11798](https://github.com/ollama/ollama/issues/11798):

```diff
// src/api/types.go (approximate)
  type Message struct {
      Role      string         `json:"role"`
      Content   string         `json:"content"`
      Images    []ImageData    `json:"images,omitempty"`
+     Audios    []AudioData    `json:"audios,omitempty"`
      ToolCalls []ToolCall     `json:"tool_calls,omitempty"`
      Thinking  string         `json:"thinking,omitempty"`
  }
```

`AudioData` would mirror `ImageData` - `[]byte` ready to feed into the
underlying llama.cpp multimodal handler when the model has an audio
projector layer.

This document plus a runnable benchmark is the contribution we plan to
post upstream on the Ollama thread.

## License notes

- Gemma 4 weights: Apache 2.0 (per the model's license file in the Ollama manifest)
- Heirloom's Modelfile + this doc: same license as the surrounding project
- Suggested reading: [Gemma 3 multimodal architecture paper](https://ai.google.dev/gemma)
  (Gemma 4 keeps the same modular projector pattern; the audio head is the
  innovation)
