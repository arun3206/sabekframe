"use client";

import { Download, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createPortraitDownloadFileName } from "@/config/portrait-download";
import { getActivePortraitTemplate } from "@/config/portrait-templates";
import { getGeneration } from "@/features/portrait-flow/generation-client";
import {
  createPaymentOrder,
  openRazorpayCheckout,
  verifyPayment,
} from "@/features/portrait-flow/payment-client";
import {
  trackCheckoutStarted,
  trackImageDownloaded,
  trackPurchase,
} from "@/lib/analytics";
import styles from "./portrait-download-button.module.css";

const downloadErrorMessage =
  "Unable to complete payment or download the portrait. Please try again.";

function extensionFor(contentType: string) {
  return contentType.toLowerCase().includes("jpeg") ? "jpg" : "png";
}

type DownloadPhase = "IDLE" | "CHECKOUT" | "VERIFYING" | "DOWNLOADING";

const phaseLabel: Record<DownloadPhase, string> = {
  IDLE: "Download HD Portrait",
  CHECKOUT: "Opening secure checkout...",
  VERIFYING: "Confirming payment...",
  DOWNLOADING: "Downloading HD portrait...",
};

export function PortraitDownloadButton({
  jobToken,
  onUnlocked,
}: {
  jobToken: string;
  onUnlocked?: () => void;
}) {
  const [phase, setPhase] = useState<DownloadPhase>("IDLE");
  const [errorMessage, setErrorMessage] = useState<string>();
  const busy = phase !== "IDLE";

  async function handleDownload() {
    setPhase("CHECKOUT");
    setErrorMessage(undefined);

    let objectUrl: string | undefined;
    try {
      const job = await getGeneration(jobToken);
      if (job.status !== "complete")
        throw new Error("Your portrait is still being prepared.");
      const template = getActivePortraitTemplate(job.templateId);
      if (!template) throw new Error("This portrait style is unavailable.");

      const order = await createPaymentOrder(jobToken, job.templateId);
      if (!order.paid) {
        const paymentAnalytics = {
          currency: order.currency,
          value: order.amount / 100,
          template,
        };
        const checkoutResult = await openRazorpayCheckout(order, () =>
          trackCheckoutStarted(paymentAnalytics),
        );
        setPhase("VERIFYING");
        await verifyPayment(order.paymentId, checkoutResult);
        trackPurchase(checkoutResult.razorpay_order_id, paymentAnalytics);
      }

      onUnlocked?.();
      setPhase("DOWNLOADING");
      const imageUrl = `/api/generations/${encodeURIComponent(jobToken)}/output`;
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
      trackImageDownloaded(template);
    } catch (error) {
      setErrorMessage(
        error instanceof Error && error.message ? error.message : downloadErrorMessage,
      );
    } finally {
      setPhase("IDLE");
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
        disabled={busy}
      >
        {busy ? (
          <LoaderCircle className={styles.spinner} aria-hidden="true" />
        ) : (
          <Download aria-hidden="true" />
        )}
        {phaseLabel[phase]}
      </Button>
      <p className={styles.paymentNote}>Secure one-time payment through Razorpay.</p>
      {errorMessage ? (
        <p className={styles.error} role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
