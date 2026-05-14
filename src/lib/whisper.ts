import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

/** Locate `storage/whisper-models/ggml-small.en.bin`. Order of resolution:
 *  1. HEIRLOOM_WHISPER_MODEL — explicit override (desktop bundle).
 *  2. Walk up from process.cwd() — handles standalone server runs from
 *     `.next/standalone` as well as `pnpm dev` from the repo root. */
function resolveModelPath(): string {
  const override = process.env.HEIRLOOM_WHISPER_MODEL;
  if (override) return override;
  const rel = path.join("storage", "whisper-models", "ggml-small.en.bin");
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, rel);
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.join(process.cwd(), rel);
}

const MODEL_PATH = resolveModelPath();

const WHISPER_BIN = process.env.HEIRLOOM_WHISPER_BIN ?? "/opt/homebrew/bin/whisper-cli";
const FFMPEG_BIN = process.env.HEIRLOOM_FFMPEG_BIN ?? "/opt/homebrew/bin/ffmpeg";

export type WhisperResult = {
  text: string;
  language: string;
  word_timestamps?: { word: string; start_ms: number; end_ms: number }[];
};

/** Run a shell command and resolve when it exits 0. */
function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(cmd)} exit ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

/** Transcode any audio file to 16kHz mono WAV (the format whisper-cli expects). */
async function toWav16k(input: string, output: string): Promise<void> {
  await run(FFMPEG_BIN, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    input,
    "-ac",
    "1",
    "-ar",
    "16000",
    output,
  ]);
}

/** Transcribe an audio file via whisper-cli. The input can be any format
 *  ffmpeg can read (mp3, m4a, webm, ogg, opus, wav, etc.). */
export async function transcribeAudio(
  audioAbsPath: string,
): Promise<WhisperResult> {
  // 1. Transcode to 16kHz mono wav alongside the original
  const wavPath = audioAbsPath.replace(/\.[^.]+$/, "") + ".wav";
  if (!audioAbsPath.endsWith(".wav")) {
    await toWav16k(audioAbsPath, wavPath);
  }

  // 2. Whisper writes a sibling .txt file
  const outBase = wavPath.replace(/\.wav$/, "");
  await run(WHISPER_BIN, [
    "-m",
    MODEL_PATH,
    "-f",
    wavPath,
    "--no-prints",
    "--output-txt",
    "-of",
    outBase,
  ]);

  const txtPath = `${outBase}.txt`;
  const text = (await fs.readFile(txtPath, "utf8")).trim();
  return { text, language: "en" };
}
