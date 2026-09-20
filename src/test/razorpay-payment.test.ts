import { describe, expect, it, vi } from "vitest";
import { janmashtamiKrishnaMakhanTemplate } from "@/config/portrait-templates";
import { isPaidForGeneration, PaymentService } from "@/server/payments/payment-service";
import { InMemoryStorage } from "@/server/uploads/storage";
import { createPaymentOrderSchema } from "@/server/payments/contracts";
import { processRazorpayWebhook } from "@/server/payments/razorpay-webhook";

const sessionId = "a6ef41b0-ac1e-48ca-a048-c09af0526ef1";
const secret = "test_secret_value";

async function hmac(orderId: string, paymentId: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${orderId}|${paymentId}`),
    ),
  );
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function setup() {
  const generationJobId = crypto.randomUUID();
  const storage = new InMemoryStorage();
  const razorpay = {
    createOrder: vi.fn(async (input: { amount: number; currency: "INR" }) => ({
      id: `order_${generationJobId}`,
      amount: input.amount,
      currency: input.currency,
    })),
    fetchPayment: vi.fn(async (paymentId: string) => ({
      id: paymentId,
      orderId: `order_${generationJobId}`,
      amount: 2900,
      currency: "INR",
      status: "captured",
      captured: true,
    })),
    fetchOrder: vi.fn(async (orderId: string) => ({
      id: orderId,
      amount: 2900,
      currency: "INR",
      receipt: generationJobId,
      status: "paid",
    })),
  };
  const service = new PaymentService({
    storage,
    razorpay,
    keyId: "rzp_test_example",
    keySecret: secret,
  });
  return { generationJobId, storage, razorpay, service };
}

describe("Razorpay payments", () => {
  it("rejects browser-controlled amount fields", () => {
    expect(
      createPaymentOrderSchema.safeParse({
        generationJobId: crypto.randomUUID(),
        templateId: janmashtamiKrishnaMakhanTemplate.id,
        amount: 1,
      }).success,
    ).toBe(false);
  });
  it("creates and persists an INR 2900 order from server pricing", async () => {
    const { generationJobId, storage, razorpay, service } = setup();
    const order = await service.createOrder({
      generationJobId,
      templateId: janmashtamiKrishnaMakhanTemplate.id,
      sessionId,
    });
    const duplicate = await service.createOrder({
      generationJobId,
      templateId: janmashtamiKrishnaMakhanTemplate.id,
      sessionId,
    });
    expect(razorpay.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 2900,
        currency: "INR",
        receipt: generationJobId,
      }),
    );
    expect(order).toMatchObject({ amount: 2900, currency: "INR", paid: false });
    expect(duplicate.razorpayOrderId).toBe(order.razorpayOrderId);
    expect(razorpay.createOrder).toHaveBeenCalledTimes(1);
    expect(await storage.getPayment(generationJobId)).toMatchObject({
      razorpayOrderId: order.razorpayOrderId,
      status: "CREATED",
    });
  });

  it("uses the stored order ID and never pays an invalid signature", async () => {
    const { generationJobId, storage, service } = setup();
    const order = await service.createOrder({
      generationJobId,
      templateId: janmashtamiKrishnaMakhanTemplate.id,
      sessionId,
    });
    const razorpayPaymentId = "pay_example";
    await expect(
      service.verify({
        paymentId: order.paymentId,
        razorpayPaymentId,
        razorpayOrderId: "order_from_untrusted_browser",
        razorpaySignature: await hmac(order.razorpayOrderId, razorpayPaymentId),
        sessionId,
      }),
    ).rejects.toMatchObject({ code: "PAYMENT_VERIFICATION_FAILED" });
    expect(await storage.getPayment(generationJobId)).not.toMatchObject({
      status: "PAID",
    });
  });

  it("marks a valid signature paid and verifies duplicate callbacks idempotently", async () => {
    const { generationJobId, storage, razorpay, service } = setup();
    const order = await service.createOrder({
      generationJobId,
      templateId: janmashtamiKrishnaMakhanTemplate.id,
      sessionId,
    });
    const razorpayPaymentId = "pay_example";
    const input = {
      paymentId: order.paymentId,
      razorpayPaymentId,
      razorpayOrderId: order.razorpayOrderId,
      razorpaySignature: await hmac(order.razorpayOrderId, razorpayPaymentId),
      sessionId,
    };
    await service.verify(input);
    await service.verify(input);
    const paid = await storage.getPayment(generationJobId);
    expect(paid).toMatchObject({ status: "PAID", razorpayPaymentId });
    expect(razorpay.fetchPayment).toHaveBeenCalledWith(razorpayPaymentId);
    expect(
      isPaidForGeneration(paid, {
        sessionId,
        generationJobId,
        templateId: janmashtamiKrishnaMakhanTemplate.id,
      }),
    ).toBe(true);
    expect(
      isPaidForGeneration(null, {
        sessionId,
        generationJobId,
        templateId: janmashtamiKrishnaMakhanTemplate.id,
      }),
    ).toBe(false);
  });

  it("does not unlock generation until Razorpay confirms capture", async () => {
    const { generationJobId, storage, razorpay, service } = setup();
    const order = await service.createOrder({
      generationJobId,
      templateId: janmashtamiKrishnaMakhanTemplate.id,
      sessionId,
    });
    razorpay.fetchPayment.mockResolvedValueOnce({
      id: "pay_authorized",
      orderId: order.razorpayOrderId,
      amount: 2900,
      currency: "INR",
      status: "authorized",
      captured: false,
    });
    await expect(
      service.verify({
        paymentId: order.paymentId,
        razorpayPaymentId: "pay_authorized",
        razorpayOrderId: order.razorpayOrderId,
        razorpaySignature: await hmac(order.razorpayOrderId, "pay_authorized"),
        sessionId,
      }),
    ).rejects.toMatchObject({ code: "PAYMENT_NOT_CAPTURED" });
    expect(await storage.getPayment(generationJobId)).toMatchObject({
      status: "CREATED",
    });
  });

  it("supports live-mode credentials when LIVE is explicitly selected", async () => {
    const generationJobId = crypto.randomUUID();
    const storage = new InMemoryStorage();
    const razorpay = {
      createOrder: vi.fn(async () => ({
        id: `order_${generationJobId}`,
        amount: 2900,
        currency: "INR",
      })),
      fetchPayment: vi.fn(),
      fetchOrder: vi.fn(),
    };
    const service = new PaymentService({
      storage,
      razorpay,
      keyId: "rzp_live_example",
      keySecret: secret,
      mode: "LIVE",
    });
    await service.createOrder({
      generationJobId,
      templateId: janmashtamiKrishnaMakhanTemplate.id,
      sessionId,
    });
    expect(await storage.getPayment(generationJobId)).toMatchObject({
      razorpayMode: "LIVE",
    });
  });

  it("processes captured webhooks idempotently", async () => {
    const { generationJobId, storage, razorpay, service } = setup();
    const order = await service.createOrder({
      generationJobId,
      templateId: janmashtamiKrishnaMakhanTemplate.id,
      sessionId,
    });
    const body = JSON.stringify({
      event: "order.paid",
      payload: {
        payment: {
          entity: {
            id: "pay_webhook",
            order_id: order.razorpayOrderId,
            amount: 2900,
            currency: "INR",
            status: "captured",
            captured: true,
          },
        },
        order: {
          entity: { id: order.razorpayOrderId, receipt: generationJobId },
        },
      },
    });
    const webhookSecret = "webhook_secret";
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(webhookSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const digest = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)),
    );
    const signature = Array.from(digest, (value) =>
      value.toString(16).padStart(2, "0"),
    ).join("");
    const dependencies = {
      storage,
      razorpay,
      credentials: {
        keyId: "rzp_test_example",
        keySecret: secret,
        webhookSecret,
        mode: "TEST" as const,
      },
    };
    await processRazorpayWebhook(body, signature, "event_1", dependencies);
    await processRazorpayWebhook(body, signature, "event_1", dependencies);
    expect(await storage.getPayment(generationJobId)).toMatchObject({
      status: "PAID",
      razorpayPaymentId: "pay_webhook",
      lastRazorpayEventId: "event_1",
    });
  });
});
