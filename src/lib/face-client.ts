"use client";

/** Browser-only face detection + embedding via face-api.js. Raw pixels
 *  never leave the device; the server only ever sees the 128-dim
 *  descriptor + bbox. Models live under `/public/models`.
 *
 *  Performance notes (this path used to take many seconds per photo):
 *   - The three model files (~6.7 MB total) load in PARALLEL, not
 *     sequentially, and are warmed with a dummy inference so the first
 *     real photo doesn't pay WebGL shader-compile + weight-upload cost.
 *   - We force the WebGL backend. face-api.js's bundled tfjs 1.7 will
 *     otherwise silently fall back to the pure-JS CPU backend on some
 *     browsers, which is 10–50× slower — the likely cause of "slow on
 *     any device".
 *   - Large phone photos are downscaled to a bounded longest edge before
 *     detection: a 12 MP image is a huge WebGL texture, and the detector
 *     resizes to `inputSize` internally anyway, so nothing is lost.
 *   - `inputSize` is 416 (÷32, TinyFaceDetector), roughly 2× faster than
 *     the old 608 with negligible recall loss for framed family photos. */

import * as faceapi from "face-api.js";

export type DetectedFace = {
  /** Bounding box in 0..1 normalized coordinates of the source image. */
  bbox: { x: number; y: number; w: number; h: number };
  /** 128-dim face descriptor from face-api.js's faceRecognitionNet. */
  embedding: number[];
};

const DETECT_INPUT_SIZE = 416;
/** Longest edge a source image is downscaled to before detection. Faces
 *  in a normally-framed photo stay well-resolved at this size. */
const MAX_DETECT_EDGE = 1280;

let modelsLoadedPromise: Promise<void> | null = null;

/** Force WebGL and warm the graph. Safe to call repeatedly. */
async function initBackend(): Promise<void> {
  const tf = faceapi.tf as
    | {
        setBackend?: (b: string) => Promise<boolean>;
        ready?: () => Promise<void>;
        getBackend?: () => string;
      }
    | undefined;
  if (!tf?.setBackend) return; // older bundle without a swappable backend
  try {
    if (tf.getBackend?.() !== "webgl") {
      await tf.setBackend("webgl");
    }
    await tf.ready?.();
  } catch {
    // WebGL unavailable (rare) — face-api falls back to CPU on its own.
  }
}

export function loadFaceModels(): Promise<void> {
  if (!modelsLoadedPromise) {
    const url = "/models";
    modelsLoadedPromise = (async () => {
      await initBackend();
      // Parallel weight downloads — the recognition net alone is ~6 MB.
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(url),
        faceapi.nets.faceLandmark68Net.loadFromUri(url),
        faceapi.nets.faceRecognitionNet.loadFromUri(url),
      ]);
      await warmUp();
    })().catch((err) => {
      modelsLoadedPromise = null;
      throw err;
    });
  }
  return modelsLoadedPromise;
}

/** Run one throwaway detection on a tiny canvas so every net compiles its
 *  WebGL shaders and uploads weights now, off the user's first photo. */
async function warmUp(): Promise<void> {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = DETECT_INPUT_SIZE;
    canvas.height = DETECT_INPUT_SIZE;
    const options = new faceapi.TinyFaceDetectorOptions({
      inputSize: DETECT_INPUT_SIZE,
      scoreThreshold: 0.3,
    });
    await faceapi
      .detectAllFaces(canvas, options)
      .withFaceLandmarks()
      .withFaceDescriptors();
  } catch {
    /* warmup is best-effort */
  }
}

async function fileToImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("image load failed"));
      img.src = url;
    });
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** Downscale to a bounded longest edge onto a canvas. Returns the source
 *  itself when it's already small enough (no needless copy). */
function boundedInput(
  img: HTMLImageElement,
): HTMLImageElement | HTMLCanvasElement {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const longest = Math.max(w, h);
  if (longest <= MAX_DETECT_EDGE) return img;
  const scale = MAX_DETECT_EDGE / longest;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return img;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function extractFaces(file: File): Promise<DetectedFace[]> {
  const t0 = performance.now();
  await loadFaceModels();
  const tLoaded = performance.now();
  const img = await fileToImage(file);
  const input = boundedInput(img);
  // bbox is normalized against the DETECTION input, which is the same
  // aspect ratio as the source, so the 0..1 coordinates map back to the
  // original image unchanged.
  const W = "naturalWidth" in input ? input.naturalWidth : input.width;
  const H = "naturalHeight" in input ? input.naturalHeight : input.height;

  const options = new faceapi.TinyFaceDetectorOptions({
    inputSize: DETECT_INPUT_SIZE,
    scoreThreshold: 0.3,
  });

  const results = await faceapi
    .detectAllFaces(input, options)
    .withFaceLandmarks()
    .withFaceDescriptors();

  const faces = results.map((r) => {
    const b = r.detection.box;
    return {
      bbox: {
        x: b.x / W,
        y: b.y / H,
        w: b.width / W,
        h: b.height / H,
      },
      embedding: Array.from(r.descriptor),
    };
  });

  const tEnd = performance.now();
  const backend =
    (faceapi.tf as { getBackend?: () => string } | undefined)?.getBackend?.() ??
    "unknown";
  console.debug(
    `[faces] ${faces.length} face(s) · backend=${backend} · ` +
      `models ${Math.round(tLoaded - t0)}ms · detect ${Math.round(tEnd - tLoaded)}ms`,
  );
  return faces;
}
