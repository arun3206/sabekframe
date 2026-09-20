"use client";

import { Download, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createPortraitDownloadFileName } from "@/config/portrait-download";
import { getActivePortraitTemplate } from "@/config/portrait-templates";
import { readStoredPortraitFlow } from "@/features/portrait-flow/storage";
import { trackImageDownloaded } from "@/lib/analytics";
import styles from "./portrait-download-button.module.css";

const downloadErrorMessage = "Unable to download the portrait. Please try again.";

function extensionFor(contentType: string) {
  return contentType.toLowerCase().includes("jpeg") ? "jpg" : "png";
}

export function PortraitDownloadButton({ imageUrl }: { imageUrl: string }) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();

  async function handleDownload() {
    setIsDownloading(true);
    setErrorMessage(undefined);

    let objectUrl: string | undefined;
    try {
      const response = await fetch(imageUrl, { credentials: "same-origin" });
      if (!response.ok) throw new Error("Portrait download failed.");

      const blob = await response.blob();
      if (!blob.size || !blob.type.toLowerCase().startsWith("image/"))
        throw new Error("Portrait download returned an invalid file.");

      objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = createPortraitDownloadFileName(extensionFor(blob.type));
      anchor.hidden = true;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      const templateId = readStoredPortraitFlow(window.localStorage).template;
      const template = templateId ? getActivePortraitTemplate(templateId) : null;
      if (template) trackImageDownloaded(template);
    } catch {
      setErrorMessage(downloadErrorMessage);
    } finally {
      setIsDownloading(false);
      if (objectUrl) {
        const urlToRevoke = objectUrl;
        window.setTimeout(() => URL.revokeObjectURL(urlToRevoke), 1_000);
      }
    }
  }

  return (
    <div className={styles.downloadArea}>
      <Button
        className={styles.downloadButton}
        type="button"
        onClick={() => void handleDownload()}
        disabled={isDownloading}
      >
        {isDownloading ? (
          <LoaderCircle className={styles.spinner} aria-hidden="true" />
        ) : (
          <Download aria-hidden="true" />
        )}
        {isDownloading ? "Downloading..." : "Download Portrait"}
      </Button>
      {errorMessage ? (
        <p className={styles.error} role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
