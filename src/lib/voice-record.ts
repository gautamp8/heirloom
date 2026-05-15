/** WAV transcoding for the voice-clone reference; the TTS sidecar
 *  doesn't accept the webm/opus MediaRecorder gives us on Chrome. */

export async function webmBlobToWav(blob: Blob): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer();
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctor();
  const audio = await ctx.decodeAudioData(arrayBuffer);
  const wav = audioBufferToWav(audio);
  await ctx.close();
  return new Blob([wav], { type: "audio/wav" });
}

function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numCh = 1;
  const sampleRate = buffer.sampleRate;
  const samples = mixToMono(buffer);
  const out = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(out);
  let p = 0;
  const wstr = (s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(p++, s.charCodeAt(i));
  };
  const wu16 = (n: number) => {
    v.setUint16(p, n, true);
    p += 2;
  };
  const wu32 = (n: number) => {
    v.setUint32(p, n, true);
    p += 4;
  };
  wstr("RIFF");
  wu32(36 + samples.length * 2);
  wstr("WAVE");
  wstr("fmt ");
  wu32(16);
  wu16(1);
  wu16(numCh);
  wu32(sampleRate);
  wu32(sampleRate * numCh * 2);
  wu16(numCh * 2);
  wu16(16);
  wstr("data");
  wu32(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    p += 2;
  }
  return out;
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
  const out = new Float32Array(buffer.length);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++)
      out[i] += data[i] / buffer.numberOfChannels;
  }
  return out;
}

export const VOICE_SCRIPT = `Sometimes I think about the things I'd want to tell you when you're older. The smell of the kitchen on a Sunday morning - bread, coffee, my mother's hands. The way the porch light always came on at five. Walking through the park in October, the leaves catching the orange light. If you ever feel small, or scared, or just unsure - remember that we paid attention. We watched the years come and go, and we wrote some of them down for you.`;
