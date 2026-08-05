import type { PendingImage } from "@/lib/types";

const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SOURCE_BYTES = 12_000_000;
const MAX_OUTPUT_BYTES = 1_200_000;
const MAX_DIMENSION = 2048;

function loadBitmap(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

async function canvasBlob(canvas: HTMLCanvasElement, type: "image/jpeg" | "image/webp", quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Image conversion failed."))), type, quality);
  });
}

export async function prepareImage(file: File): Promise<PendingImage> {
  if (!SUPPORTED_TYPES.has(file.type)) throw new Error("Use a JPEG, PNG, or WebP image.");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("The source image must be smaller than 12 MB.");

  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("This browser cannot process images.");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let blob = await canvasBlob(canvas, "image/webp", 0.86);
  for (const quality of [0.76, 0.66, 0.56]) {
    if (blob.size <= MAX_OUTPUT_BYTES) break;
    blob = await canvasBlob(canvas, "image/webp", quality);
  }
  if (blob.size > MAX_OUTPUT_BYTES) throw new Error("The processed image is still too large. Choose a smaller image.");

  return {
    id: crypto.randomUUID(),
    name: file.name.replace(/\.[^.]+$/, "") + ".webp",
    mediaType: "image/webp",
    width,
    height,
    size: blob.size,
    blob,
    previewUrl: URL.createObjectURL(blob),
  };
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("Could not read image."));
    reader.readAsDataURL(blob);
  });
}
