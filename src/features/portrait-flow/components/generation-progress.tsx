"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { MobilePageContainer } from "@/components/layout/mobile-page-container";
import { Card } from "@/components/ui/card";
import { getActivePortraitTemplate } from "@/config/portrait-templates";
import {
  clearPendingGenerationIntent,
  readPendingGenerationIntent,
  toStartGenerationInput,
  updatePendingGenerationIntent,
  type PendingGenerationIntent,
} from "@/features/portrait-flow/generation-intent-storage";
import {
  getGeneration,
  startGeneration,
} from "@/features/portrait-flow/generation-client";
import {
  createPaymentOrder,
  openRazorpayCheckout,
  verifyPayment,
} from "@/features/portrait-flow/payment-client";
import {
  normalizeGenerationError,
  trackCheckoutStarted,
  trackGenerationCompleted,
  trackGenerationFailed,
  trackPurchase,
} from "@/lib/analytics";
import styles from "./generation-progress.module.css";

type ExperiencePhase =
  | "PREPARING_PAYMENT"
  | "PAYMENT_OPEN"
  | "PAYMENT_VERIFICATION"
  | "GENERATING"
  | "POLLING"
  | "FAILED";

const phaseCopy: Record<
  Exclude<ExperiencePhase, "FAILED">,
  { eyebrow: string; title: string; message: string }
> = {
  PREPARING_PAYMENT: {
    eyebrow: "Secure payment",
    title: "Preparing secure checkout…",
    message: "This product is generated after payment.",
  },
  PAYMENT_OPEN: {
    eyebrow: "Secure payment",
    title: "Complete your payment",
    message: "Razorpay Checkout is ready for your payment.",
  },
  PAYMENT_VERIFICATION: {
    eyebrow: "Secure payment",
    title: "Confirming your payment…",
    message: "Please keep this page open for a moment.",
  },
  GENERATING: {
    eyebrow: "Creating your memory",
    title: "Creating your special moment…",
    message: "Your portrait preview is being prepared. No payment is needed yet.",
  },
  POLLING: {
    eyebrow: "Creating your memory",
    title: "Creating your special moment…",
    message: "This may take a little while. No payment is needed yet.",
  },
};

export function GenerationProgress({ jobToken }: { jobToken: string }) {
  const router = useRouter();
  const running = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<ExperiencePhase>("GENERATING");
  const [message, setMessage] = useState(phaseCopy.GENERATING.message);
  const [failureKind, setFailureKind] = useState<"PAYMENT" | "GENERATION">("GENERATION");

  useEffect(() => {
    if (running.current) return;
    let active = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const showPhase = (nextPhase: Exclude<ExperiencePhase, "FAILED">) => {
      if (!active) return;
      setPhase(nextPhase);
      setMessage(phaseCopy[nextPhase].message);
    };

    const finish = (resultToken: string) => {
      clearPendingGenerationIntent(window.localStorage);
      router.replace(`/result/${encodeURIComponent(resultToken)}`);
    };

    const fail = (
      error: unknown,
      kind: "PAYMENT" | "GENERATION",
      templateId?: string,
    ) => {
      if (!active) return;
      const analyticsTemplate = templateId ? getActivePortraitTemplate(templateId) : null;
      if (kind === "GENERATION" && analyticsTemplate)
        trackGenerationFailed(analyticsTemplate, normalizeGenerationError(error));
      running.current = false;
      setFailureKind(kind);
      setPhase("FAILED");
      setMessage(
        error instanceof Error ? error.message : "We couldn’t finish this portrait.",
      );
    };

    const poll = async (templateId?: string) => {
      let analyticsTemplate = templateId ? getActivePortraitTemplate(templateId) : null;
      try {
        const job = await getGeneration(jobToken);
        if (!active) return;
        analyticsTemplate ??= getActivePortraitTemplate(job.templateId);
        if (job.status === "complete") {
          finish(job.jobToken);
          if (analyticsTemplate)
            trackGenerationCompleted(analyticsTemplate, job.jobToken);
          return;
        }
        if (job.status === "failed")
          throw new Error(job.errorMessage ?? "We couldn’t finish this portrait.");
        showPhase("POLLING");
        timeout = setTimeout(() => void poll(templateId), 3_000);
      } catch (error) {
        const storedIntent = readPendingGenerationIntent(window.localStorage);
        if (storedIntent?.requestId === jobToken)
          updatePendingGenerationIntent(window.localStorage, storedIntent, {
            phase: "FAILED",
            autoStart: false,
            failureKind: "GENERATION",
          });
        fail(error, "GENERATION", analyticsTemplate?.id);
      }
    };

    const generate = async (intent: PendingGenerationIntent) => {
      const updated = updatePendingGenerationIntent(window.localStorage, intent, {
        phase: "GENERATING",
        autoStart: false,
        failureKind: undefined,
      });
      showPhase("GENERATING");
      try {
        const job = await startGeneration(toStartGenerationInput(updated));
        if (!active) return;
        if (job.status === "complete") {
          finish(job.jobToken);
          const analyticsTemplate = getActivePortraitTemplate(updated.templateId);
          if (analyticsTemplate)
            trackGenerationCompleted(analyticsTemplate, job.jobToken);
          return;
        }
        if (job.status === "failed")
          throw new Error(job.errorMessage ?? "We couldn’t finish this portrait.");
        await poll(updated.templateId);
      } catch (error) {
        updatePendingGenerationIntent(window.localStorage, updated, {
          phase: "FAILED",
          autoStart: false,
          failureKind: "GENERATION",
        });
        fail(error, "GENERATION", updated.templateId);
      }
    };

    const payThenGenerate = async (intent: PendingGenerationIntent) => {
      let updated = updatePendingGenerationIntent(window.localStorage, intent, {
        phase: "PREPARING_PAYMENT",
        autoStart: false,
        failureKind: undefined,
      });
      showPhase("PREPARING_PAYMENT");
      try {
        const order = await createPaymentOrder(updated.requestId, updated.templateId);
        if (!active) return;
        const template = getActivePortraitTemplate(updated.templateId);
        const paymentAnalytics = template
          ? { currency: order.currency, value: order.amount / 100, template }
          : null;
        if (!order.paid) {
          updated = updatePendingGenerationIntent(window.localStorage, updated, {
            phase: "PAYMENT_OPEN",
          });
          showPhase("PAYMENT_OPEN");
          const checkoutResult = await openRazorpayCheckout(order, () => {
            if (paymentAnalytics) trackCheckoutStarted(paymentAnalytics);
          });
          if (!active) return;
          updated = updatePendingGenerationIntent(window.localStorage, updated, {
            phase: "PAYMENT_VERIFICATION",
          });
          showPhase("PAYMENT_VERIFICATION");
          await verifyPayment(order.paymentId, checkoutResult);
          if (!active) return;
          if (paymentAnalytics)
            trackPurchase(checkoutResult.razorpay_order_id, paymentAnalytics);
        }
        await generate(updated);
      } catch (error) {
        const kind = updated.phase === "GENERATING" ? "GENERATION" : "PAYMENT";
        updatePendingGenerationIntent(window.localStorage, updated, {
          phase: "FAILED",
          autoStart: false,
          failureKind: kind,
        });
        fail(error, kind, updated.templateId);
      }
    };

    const intent = readPendingGenerationIntent(window.localStorage);
    timeout = setTimeout(() => {
      if (!active) return;
      running.current = true;
      if (intent?.requestId === jobToken) {
        if (intent.phase === "FAILED" && attempt === 0) {
          running.current = false;
          setFailureKind(intent.failureKind ?? "GENERATION");
          setPhase("FAILED");
          setMessage(
            intent.failureKind === "PAYMENT"
              ? "Payment was not completed."
              : "We couldn’t finish this portrait.",
          );
          return;
        }
        const template = getActivePortraitTemplate(intent.templateId);
        if (template?.paymentTiming === "PAY_THEN_GENERATE") void payThenGenerate(intent);
        else void generate(intent);
        return;
      }
      showPhase("POLLING");
      void poll();
    }, 0);

    return () => {
      active = false;
      running.current = false;
      if (timeout) clearTimeout(timeout);
    };
  }, [attempt, jobToken, router]);

  const failed = phase === "FAILED";
  const copy = failed
    ? failureKind === "PAYMENT"
      ? { eyebrow: "Payment paused", title: "Payment was not completed" }
      : { eyebrow: "Generation paused", title: "We couldn’t finish this portrait" }
    : phaseCopy[phase];

  return (
    <>
      <AppHeader backHref="/create" />
      <MobilePageContainer className={styles.page}>
        <Card className={styles.card}>
          {!failed ? (
            <LoaderCircle className={styles.spinner} aria-hidden="true" />
          ) : null}
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p className="muted" role="status" aria-live="polite">
            {message}
          </p>
          {failed ? (
            <div className={styles.actions}>
              <button
                className="button"
                type="button"
                onClick={() => setAttempt((current) => current + 1)}
              >
                {failureKind === "PAYMENT" ? "Try Payment Again" : "Try Generation Again"}
              </button>
              <Link className={styles.secondary} href="/create">
                Back
              </Link>
            </div>
          ) : (
            <small>You can keep this page open while we prepare your preview.</small>
          )}
        </Card>
      </MobilePageContainer>
    </>
  );
}
