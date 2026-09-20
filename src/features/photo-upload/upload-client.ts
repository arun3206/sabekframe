import type {
  FaceBoundingBox,
  FinalizedUploadResponse,
  PreparedUploadResponse,
  PrepareUploadInput,
} from "@/features/photo-upload/types";

async function readData<T>(response: Response): Promise<T> {
  const rawBody = await response.text();
  let body: {
    ok: boolean;
    data?: T;
    error?: { message: string };
  };
  try {
    body = JSON.parse(rawBody) as typeof body;
  } catch {
    throw new Error(
      response.status >= 500
        ? "Photo storage is temporarily unavailable. Please retry in a moment."
        : "The upload service returned an invalid response. Please try again.",
    );
  }
  if (!response.ok || !body.data)
    throw new Error(body.error?.message ?? "The request failed. Please try again.");
  return body.data;
}

export async function prepareUpload(input: PrepareUploadInput) {
  return readData<PreparedUploadResponse>(
    await fetch("/api/uploads/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export function sendPreparedUpload(
  prepared: PreparedUploadResponse,
  file: File,
  onProgress: (value: number) => void,
  signal?: AbortSignal,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", prepared.uploadUrl);
    for (const [key, value] of Object.entries(prepared.uploadHeaders))
      request.setRequestHeader(key, value);
    request.upload.onprogress = (event) =>
      event.lengthComputable &&
      onProgress(Math.round((event.loaded / event.total) * 100));
    request.onload = () =>
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(new Error("The upload was interrupted. Please try again."));
    request.onerror = () =>
      reject(new Error("The upload was interrupted. Check your connection and retry."));
    signal?.addEventListener("abort", () => request.abort(), { once: true });
    request.send(file);
  });
}

export async function finalizeUpload(
  input: PrepareUploadInput & {
    uploadId: string;
    clientQualityStatus: "pass" | "warning-accepted";
    faceBoundingBox: FaceBoundingBox | null;
  },
) {
  return readData<FinalizedUploadResponse>(
    await fetch("/api/uploads/finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function deleteUpload(assetId: string) {
  const response = await fetch(`/api/uploads/${assetId}`, { method: "DELETE" });
  if (!response.ok && response.status !== 404)
    throw new Error("The photo could not be removed. Please retry.");
}

export async function getPreview(assetId: string) {
  return readData<{ url: string; expiresIn: number }>(
    await fetch(`/api/uploads/${assetId}/preview`, { cache: "no-store" }),
  );
}
