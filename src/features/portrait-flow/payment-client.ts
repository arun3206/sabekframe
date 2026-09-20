import type { PortraitTemplate } from "@/features/portrait-flow/types";
import type { PublicPaymentOrder } from "@/server/payments/types";

async function data<T>(response: Response): Promise<T> {
  const body: unknown = await response.json().catch(() => null);
  if (
    body &&
    typeof body === "object" &&
    "ok" in body &&
    body.ok === true &&
    "data" in body
  )
    return body.data as T;
  const message =
    body &&
    typeof body === "object" &&
    "error" in body &&
    body.error &&
    typeof body.error === "object" &&
    "message" in body.error &&
    typeof body.error.message === "string"
      ? body.error.message
      : "Payment is temporarily unavailable.";
  throw new Error(message);
}

export function createPaymentOrder(
  generationJobId: string,
  templateId: PortraitTemplate,
) {
  return fetch("/api/payments/create-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ generationJobId, templateId }),
  }).then((response) => data<PublicPaymentOrder>(response));
}

export interface RazorpaySuccess {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayInstance {
  open(): void;
  on(event: "payment.failed", listener: () => void): void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

let checkoutScript: Promise<void> | undefined;
function loadCheckout() {
  if (window.Razorpay) return Promise.resolve();
  return (checkoutScript ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Payment checkout could not be loaded."));
    document.head.appendChild(script);
  }));
}

export async function openRazorpayCheckout(
  order: PublicPaymentOrder,
  onOpened?: () => void,
) {
  await loadCheckout();
  if (!window.Razorpay) throw new Error("Payment checkout could not be loaded.");
  return new Promise<RazorpaySuccess>((resolve, reject) => {
    let completed = false;
    const checkout = new window.Razorpay!({
      key: order.razorpayKeyId,
      amount: order.amount,
      currency: order.currency,
      order_id: order.razorpayOrderId,
      name: "Yaadon",
      description: "1 AI Portrait Generation",
      handler: (result: RazorpaySuccess) => {
        completed = true;
        resolve(result);
      },
      modal: {
        ondismiss: () => {
          if (!completed) reject(new Error("Payment was not completed."));
        },
      },
    });
    checkout.on("payment.failed", () => reject(new Error("Payment was not completed.")));
    checkout.open();
    try {
      onOpened?.();
    } catch {
      // Observers must never interfere with Razorpay Checkout.
    }
  });
}

export function verifyPayment(paymentId: string, result: RazorpaySuccess) {
  return fetch("/api/payments/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      paymentId,
      razorpayPaymentId: result.razorpay_payment_id,
      razorpayOrderId: result.razorpay_order_id,
      razorpaySignature: result.razorpay_signature,
    }),
  }).then((response) => data<{ paid: true }>(response));
}
