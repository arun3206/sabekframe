import type { ImageQualityResult } from "@/features/photo-upload/types";
import { analyzeOnMainThread } from "@/features/photo-upload/main-thread-quality";

export interface ImageQualityAnalyzer {
  analyze(file: File, signal?: AbortSignal): Promise<ImageQualityResult>;
}

export const browserImageQualityAnalyzer: ImageQualityAnalyzer = {
  analyze(file, signal) {
    if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") {
      return analyzeOnMainThread(file);
    }
    return new Promise((resolve, reject) => {
      const worker = new Worker(
        new URL("./workers/image-quality.worker.ts", import.meta.url),
        { type: "module" },
      );
      const id = crypto.randomUUID();
      const finish = () => worker.terminate();
      signal?.addEventListener(
        "abort",
        () => {
          finish();
          reject(new DOMException("Cancelled", "AbortError"));
        },
        { once: true },
      );
      worker.onmessage = (
        event: MessageEvent<{ id: string; result?: ImageQualityResult; error?: string }>,
      ) => {
        if (event.data.id !== id) return;
        finish();
        if (event.data.result) resolve(event.data.result);
        else reject(new Error(event.data.error ?? "Photo quality check failed."));
      };
      worker.onerror = () => {
        finish();
        if (signal?.aborted) reject(new DOMException("Cancelled", "AbortError"));
        else void analyzeOnMainThread(file).then(resolve, reject);
      };
      worker.postMessage({ id, file });
    });
  },
};
