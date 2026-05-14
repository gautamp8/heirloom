/**
 * Client for the local TTS sidecar (`infra/tts-server`).
 *
 * Two operations:
 *   - encode(wav, referenceText) — register a voice with the sidecar,
 *     get back a voice_id. Called once at onboarding.
 *   - speak(voiceId, text) — synthesize `text` in the voice. Called on
 *     every playback request. Returns audio/wav bytes.
 *
 * The sidecar caches encoded prompts in-memory; on restart it
 * re-encodes from the stored wav transparently.
 */

const TTS_BASE = process.env.HEIRLOOM_TTS_URL ?? "http://127.0.0.1:11435";

export type EncodeResult = {
  voice_id: string;
  duration_seconds: number;
  sample_rate: number;
};

export async function encodeReference(
  wav: ArrayBuffer | Uint8Array | Buffer,
  filename = "reference.wav",
): Promise<EncodeResult> {
  const blob = new Blob([wav as BlobPart], { type: "audio/wav" });
  const fd = new FormData();
  fd.append("audio", blob, filename);
  const r = await fetch(`${TTS_BASE}/encode`, { method: "POST", body: fd });
  if (!r.ok) throw new Error(`tts encode: ${r.status} ${await r.text()}`);
  return (await r.json()) as EncodeResult;
}

export async function speak(
  voice_id: string,
  text: string,
  signal?: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  const r = await fetch(`${TTS_BASE}/speak`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ voice_id, text }),
    signal,
  });
  if (!r.ok) throw new Error(`tts speak: ${r.status} ${await r.text()}`);
  if (!r.body) throw new Error("tts speak: empty body");
  return r.body;
}

export async function ttsHealth(): Promise<{
  ok: boolean;
  device: string;
  loaded: boolean;
}> {
  try {
    const r = await fetch(`${TTS_BASE}/healthz`, {
      signal: AbortSignal.timeout(800),
    });
    if (!r.ok) return { ok: false, device: "unknown", loaded: false };
    return (await r.json()) as { ok: boolean; device: string; loaded: boolean };
  } catch {
    return { ok: false, device: "unknown", loaded: false };
  }
}
