import { z } from "zod";
import { RazorpayClient, type RazorpayApi } from "@/server/payments/razorpay-client";
import { resolveRazorpayCredentials } from "@/server/payments/razorpay-credentials";
import {
  getPrivateImageStorage,
  type PrivateImageStorageProvider,
} from "@/server/uploads/storage";

const webhookSchema = z.object({
  event: z.enum(["payment.captured", "order.paid", "payment.failed"]),
  payload: z.object({
    payment: z.object({
      entity: z.object({
        id: z.string().min(1),
        order_id: z.string().min(1),
        amount: z.number().int().positive(),
        currency: z.string().min(1),
        status: z.string().min(1),
        captured: z.boolean(),
      }),
    }),
    order: z
      .object({
        entity: z.object({
          id: z.string().min(1),
          receipt: z.string().uuid(),
        }),
      })
      .optional(),
  }),
});

async function hmac(message: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)),
  );
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function secureEqual(first: string, second: string) {
  if (first.length !== second.length) return false;
  let difference = 0;
  for (let index = 0; index < first.length; index += 1)
    difference |= first.charCodeAt(index) ^ second.charCodeAt(index);
  return difference === 0;
}

interface Dependencies {
  storage?: PrivateImageStorageProvider;
  razorpay?: RazorpayApi;
  credentials?: Awaited<ReturnType<typeof resolveRazorpayCredentials>>;
  now?: () => number;
}

export async function processRazorpayWebhook(
  rawBody: string,
  signature: string,
  eventId: string,
  dependencies: Dependencies = {},
) {
  const credentials = dependencies.credentials ?? (await resolveRazorpayCredentials());
  if (!credentials.webhookSecret)
    throw new Error("Razorpay webhook secret is not configured.");
  const expected = await hmac(rawBody, credentials.webhookSecret);
  if (!secureEqual(expected, signature.toLowerCase()))
    throw new Error("Razorpay webhook signature is invalid.");

  const event = webhookSchema.parse(JSON.parse(rawBody) as unknown);
  const payment = event.payload.payment.entity;
  const api = dependencies.razorpay ?? new RazorpayClient(credentials);
  const order = event.payload.order?.entity ?? (await api.fetchOrder(payment.order_id));
  if (order.id !== payment.order_id) throw new Error("Razorpay order mismatch.");

  const storage = dependencies.storage ?? getPrivateImageStorage();
  const record = await storage.getPayment(order.receipt);
  if (!record || record.razorpayOrderId !== payment.order_id)
    return { accepted: true, matched: false } as const;
  if ((record.razorpayMode ?? "TEST") !== credentials.mode)
    throw new Error("Razorpay payment mode mismatch.");
  if (
    payment.amount !== record.amount ||
    payment.currency !== record.currency ||
    (record.razorpayPaymentId && record.razorpayPaymentId !== payment.id)
  )
    throw new Error("Razorpay payment details mismatch.");
  if (record.lastRazorpayEventId === eventId)
    return { accepted: true, matched: true } as const;

  if (event.event === "payment.failed") {
    if (record.status !== "PAID")
      await storage.savePayment({
        ...record,
        status: "FAILED",
        razorpayPaymentId: payment.id,
        lastRazorpayEventId: eventId,
      });
    return { accepted: true, matched: true } as const;
  }

  if (payment.status !== "captured" || !payment.captured)
    throw new Error("Razorpay payment is not captured.");
  await storage.savePayment({
    ...record,
    status: "PAID",
    razorpayPaymentId: payment.id,
    paidAt: record.paidAt ?? (dependencies.now ?? Date.now)(),
    lastRazorpayEventId: eventId,
  });
  return { accepted: true, matched: true } as const;
}
