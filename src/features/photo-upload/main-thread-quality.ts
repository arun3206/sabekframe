import { photoUploadRestrictions } from "@/config/photo-upload";
import type { FaceBoundingBox, ImageQualityResult } from "@/features/photo-upload/types";
import { classifyQuality, laplacianVariance } from "@/features/photo-upload/quality";

function greyscale(image: ImageData) {
  const values = new Uint8ClampedArray(image.width * image.height);
  for (let index = 0; index < values.length; index += 1) {
    const pixel = index * 4;
    values[index] = Math.round(
      0.299 * (image.data[pixel] ?? 0) +
        0.587 * (image.data[pixel + 1] ?? 0) +
        0.114 * (image.data[pixel + 2] ?? 0),
    );
  }
  return values;
}

export async function analyzeOnMainThread(file: File): Promise<ImageQualityResult> {
  const bitmap = await createImageBitmap(file);
  const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
  const files = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
  const detector = await FaceDetector.createFromOptions(files, {
    baseOptions: {
      modelAssetPath: "/mediapipe/blaze_face_short_range.tflite",
      delegate: "CPU",
    },
    runningMode: "IMAGE",
    minDetectionConfidence: photoUploadRestrictions.face.minimumDetectionConfidence,
  });
  const detections = detector.detect(bitmap).detections;
  detector.close();
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas unavailable");
  context.drawImage(bitmap, 0, 0);
  const all = context.getImageData(0, 0, bitmap.width, bitmap.height);
  const overallSharpness = laplacianVariance(greyscale(all), all.width, all.height);
  let box: FaceBoundingBox | null = null;
  let faceSharpness = 0;
  let brightness = 0;
  let cropped = false;
  let faceSizeRatio = 0;
  if (detections.length === 1 && detections[0]?.boundingBox) {
    const raw = detections[0].boundingBox;
    const expansionX = raw.width * photoUploadRestrictions.face.boundingBoxExpansionRatio;
    const expansionY =
      raw.height * photoUploadRestrictions.face.boundingBoxExpansionRatio;
    const left = Math.max(0, Math.floor(raw.originX - expansionX));
    const top = Math.max(0, Math.floor(raw.originY - expansionY));
    const right = Math.min(bitmap.width, Math.ceil(raw.originX + raw.width + expansionX));
    const bottom = Math.min(
      bitmap.height,
      Math.ceil(raw.originY + raw.height + expansionY),
    );
    const edge = photoUploadRestrictions.face.croppedEdgeRatio;
    cropped =
      raw.originX / bitmap.width <= edge ||
      raw.originY / bitmap.height <= edge ||
      (raw.originX + raw.width) / bitmap.width >= 1 - edge ||
      (raw.originY + raw.height) / bitmap.height >= 1 - edge;
    box = {
      x: left / bitmap.width,
      y: top / bitmap.height,
      width: (right - left) / bitmap.width,
      height: (bottom - top) / bitmap.height,
    };
    faceSizeRatio = (raw.width * raw.height) / (bitmap.width * bitmap.height);
    const crop = context.getImageData(left, top, right - left, bottom - top);
    const grey = greyscale(crop);
    faceSharpness = laplacianVariance(grey, crop.width, crop.height);
    brightness = grey.reduce((sum, value) => sum + value, 0) / grey.length;
  }
  bitmap.close();
  return classifyQuality({
    faceCount: detections.length,
    faceBoundingBox: box,
    faceSizeRatio,
    faceSharpness,
    overallSharpness,
    brightness,
    cropped,
    shortestSide: Math.min(canvas.width, canvas.height),
  });
}
