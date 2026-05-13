"use client";

/**
 * Browser-only face detection + embedding via face-api.js.
 *
 * Privacy posture: raw face pixels never leave the device. Server only
 * ever sees the 128-dim descriptor + the bbox.
 *
 * Models are bundled under /public/models — no CDN load.
 */

import * as faceapi from "face-api.js";

export type DetectedFace = {
  /** Bounding box in 0..1 normalized coordinates of the source image. */
  bbox: { x: number; y: number; w: number; h: number };
  /** 128-dim face descriptor from face-api.js's faceRecognitionNet. */
  embedding: number[];
};

let modelsLoadedPromise: Promise<void> | null = null;

export function loadFaceModels(): Promise<void> {
  if (!modelsLoadedPromise) {
    const url = "/models";
    modelsLoadedPromise = (async () => {
      await faceapi.nets.tinyFaceDetector.loadFromUri(url);
      await faceapi.nets.faceLandmark68Net.loadFromUri(url);
      await faceapi.nets.faceRecognitionNet.loadFromUri(url);
    })().catch((err) => {
      modelsLoadedPromise = null;
      throw err;
    });
  }
  return modelsLoadedPromise;
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
    // Caller revokes after detection completes
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/**
 * Run detection + landmark + descriptor on a File.
 * Returns one record per detected face. Empty array when no faces.
 *
 * Timing on M4 Pro: ~250ms for a 1024px photo with 1 face.
 */
export async function extractFaces(file: File): Promise<DetectedFace[]> {
  await loadFaceModels();
  const img = await fileToImage(file);
  const W = img.naturalWidth || img.width;
  const H = img.naturalHeight || img.height;

  const options = new faceapi.TinyFaceDetectorOptions({
    inputSize: 416,
    scoreThreshold: 0.5,
  });

  const results = await faceapi
    .detectAllFaces(img, options)
    .withFaceLandmarks()
    .withFaceDescriptors();

  return results.map((r) => {
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
}
