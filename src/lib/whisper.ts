import { promises as fs } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const MODEL_PATH = path.join(
  process.cwd(),
  "storage",
  "whisper-models",
  "ggml-small.en.bin",
);

const WHISPER_BIN = "/opt/homebrew/bin/whisper-cli";
const FFMPEG_BIN = "/opt/homebrew/bin/ffmpeg";

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
