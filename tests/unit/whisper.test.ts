import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  promises as fs,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

const stubDir = mkdtempSync(path.join(tmpdir(), "heirloom-whisper-stubs-"));
const logDir = path.join(stubDir, "logs");
const MODEL = "/fake/models/ggml-test.en.bin";
const TRANSCRIPT = "Hello from the archive.";
const WHISPER_STDERR = "model load failed: ggml file truncated";
const FFMPEG_STDERR = "invalid data found when processing input";

function writeStub(name: string, body: string) {
  const p = path.join(stubDir, name);
  writeFileSync(p, `#!/bin/bash\n${body}`, { mode: 0o755 });
  return p;
}

async function makeInput(ext: string) {
  const dir = mkdtempSync(path.join(tmpdir(), "heirloom-audio-"));
  const p = path.join(dir, `note${ext}`);
  await fs.writeFile(p, "fake-audio-bytes");
  return p;
}

async function readArgs(name: string): Promise<string[] | null> {
  const p = path.join(logDir, name);
  if (!existsSync(p)) return null;
  const raw = await fs.readFile(p, "utf8");
  return raw.split("\n").slice(0, -1);
}

let transcribeAudio: typeof import("@/lib/whisper").transcribeAudio;

beforeAll(async () => {
  mkdirSync(logDir, { recursive: true });

  // Stubs read STUB_LOG_DIR and *_STUB_MODE at spawn time (spawn inherits
  // process.env), so tests can flip behavior without re-importing.
  const ffmpeg = writeStub(
    "ffmpeg",
    `printf '%s\\n' "$@" > "$STUB_LOG_DIR/ffmpeg-args.txt"
if [ "$FFMPEG_STUB_MODE" = "fail" ]; then
  echo "${FFMPEG_STDERR}" >&2
  exit 1
fi
for out in "$@"; do :; done
printf 'RIFF' > "$out"
`,
  );
  const whisper = writeStub(
    "whisper-cli",
    `printf '%s\\n' "$@" > "$STUB_LOG_DIR/whisper-args.txt"
if [ "$WHISPER_STUB_MODE" = "fail" ]; then
  echo "${WHISPER_STDERR}" >&2
  exit 3
fi
outbase=""
prev=""
for a in "$@"; do
  if [ "$prev" = "-of" ]; then outbase="$a"; fi
  prev="$a"
done
printf '  %s \\n\\n' "${TRANSCRIPT}" > "\${outbase}.txt"
`,
  );

  // Bins and model path are frozen at module import time.
  process.env.HEIRLOOM_FFMPEG_BIN = ffmpeg;
  process.env.HEIRLOOM_WHISPER_BIN = whisper;
  process.env.HEIRLOOM_WHISPER_MODEL = MODEL;
  process.env.STUB_LOG_DIR = logDir;
  ({ transcribeAudio } = await import("@/lib/whisper"));
});

beforeEach(async () => {
  delete process.env.FFMPEG_STUB_MODE;
  delete process.env.WHISPER_STUB_MODE;
  await fs.rm(logDir, { recursive: true, force: true });
  mkdirSync(logDir, { recursive: true });
});

describe("transcribeAudio happy path", () => {
  it("converts non-wav input via ffmpeg, then returns trimmed text as en", async () => {
    const input = await makeInput(".m4a");
    const wavPath = input.replace(/\.m4a$/, ".wav");

    const result = await transcribeAudio(input);
    expect(result).toEqual({ text: TRANSCRIPT, language: "en" });

    const ffmpegArgs = await readArgs("ffmpeg-args.txt");
    expect(ffmpegArgs).not.toBeNull();
    expect(ffmpegArgs!.at(-1)).toBe(wavPath);
    expect(ffmpegArgs!.slice(ffmpegArgs!.indexOf("-i"))).toEqual([
      "-i",
      input,
      "-ac",
      "1",
      "-ar",
      "16000",
      wavPath,
    ]);
    expect(existsSync(wavPath)).toBe(true);

    const whisperArgs = await readArgs("whisper-args.txt");
    expect(whisperArgs).not.toBeNull();
    expect(whisperArgs![whisperArgs!.indexOf("-f") + 1]).toBe(wavPath);
    expect(whisperArgs).toContain("--no-prints");
    expect(whisperArgs).toContain("--output-txt");
    expect(whisperArgs![whisperArgs!.indexOf("-of") + 1]).toBe(
      wavPath.replace(/\.wav$/, ""),
    );
  });

  it("passes HEIRLOOM_WHISPER_MODEL to whisper via -m", async () => {
    const input = await makeInput(".mp3");
    await transcribeAudio(input);

    const whisperArgs = await readArgs("whisper-args.txt");
    expect(whisperArgs![whisperArgs!.indexOf("-m") + 1]).toBe(MODEL);
  });

  it("skips ffmpeg entirely for .wav input", async () => {
    const input = await makeInput(".wav");

    const result = await transcribeAudio(input);
    expect(result).toEqual({ text: TRANSCRIPT, language: "en" });

    expect(await readArgs("ffmpeg-args.txt")).toBeNull();
    const whisperArgs = await readArgs("whisper-args.txt");
    expect(whisperArgs![whisperArgs!.indexOf("-f") + 1]).toBe(input);
  });
});

describe("transcribeAudio failures", () => {
  it("throws with whisper's exit code and stderr in the message", async () => {
    process.env.WHISPER_STUB_MODE = "fail";
    const input = await makeInput(".wav");

    await expect(transcribeAudio(input)).rejects.toThrow(
      `whisper-cli exit 3: ${WHISPER_STDERR}`,
    );
  });

  it("throws with ffmpeg's stderr and never invokes whisper", async () => {
    process.env.FFMPEG_STUB_MODE = "fail";
    const input = await makeInput(".m4a");

    await expect(transcribeAudio(input)).rejects.toThrow(
      `ffmpeg exit 1: ${FFMPEG_STDERR}`,
    );
    expect(await readArgs("whisper-args.txt")).toBeNull();
  });
});
