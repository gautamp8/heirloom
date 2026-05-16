"use client";

/** Browser-only face detection + embedding via face-api.js. Raw pixels
 *  never leave the device; the server only ever sees the 128-dim
 *  descriptor + bbox. Models live under `/public/models`. */

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
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export async function extractFaces(file: File): Promise<DetectedFace[]> {
  await loadFaceModels();
  const img = await fileToImage(file);
  const W = img.naturalWidth || img.width;
  const H = img.naturalHeight || img.height;

  // Larger inputSize keeps small faces in group photos detectable;
  // lower scoreThreshold avoids rejecting partially-lit / off-angle
  // faces that are still clearly people.
  const options = new faceapi.TinyFaceDetectorOptions({
    inputSize: 608,
    scoreThreshold: 0.3,
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
