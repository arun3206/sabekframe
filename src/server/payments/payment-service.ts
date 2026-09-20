import { formatPrice, pricing } from "@/config/pricing";
import type { PortraitTemplate } from "@/features/portrait-flow/types";
import { RazorpayClient, type RazorpayApi } from "@/server/payments/razorpay-client";
import {
  resolveRazorpayCredentials,
  type RazorpayMode,
} from "@/server/payments/razorpay-credentials";
import type { PaymentRecord, PublicPaymentOrder } from "@/server/payments/types";
import {
  getPrivateImageStorage,
  type PrivateImageStorageProvider,
} from "@/server/uploads/storage";

const PAYMENT_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;

export class PaymentServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = "PaymentServiceError";
  }
}

interface Dependencies {
  storage?: PrivateImageStorageProvider;
  razorpay?: RazorpayApi;
  keyId?: string;
  keySecret?: string;
  mode?: RazorpayMode;
  now?: () => number;
}

function paymentTerms() {
  const amount = Number(process.env.RAZORPAY_PORTRAIT_PRICE ?? pricing.offer.amountMinor);
  const currency = process.env.RAZORPAY_CURRENCY ?? pricing.currency;
  if (amount !== pricing.offer.amountMinor || currency !== "INR")
    throw new PaymentServiceError(
      "PAYMENT_CONFIGURATION",
      "Payment is temporarily unavailable.",
      503,
    );
  return { amount, currency: "INR" as const };
}

async function signature(orderId: string, paymentId: string, secret: string) {
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

function secureEqual(first: string, second: string) {
  if (first.length !== second.length) return false;
  let difference = 0;
  for (let index = 0; index < first.length; index += 1)
    difference |= first.charCodeAt(index) ^ second.charCodeAt(index);
  return difference === 0;
}

function paymentMode(record: PaymentRecord): RazorpayMode {
  return record.razorpayMode ?? "TEST";
}

export class PaymentService {
  private readonly storage: PrivateImageStorageProvider;
  private readonly now: () => number;
  constructor(private readonly dependencies: Dependencies = {}) {
    this.storage = dependencies.storage ?? getPrivateImageStorage();
    this.now = dependencies.now ?? Date.now;
  }

  private async credentials() {
    if (
      this.dependencies.keyId !== undefined ||
      this.dependencies.keySecret !== undefined
    ) {
      const keyId = this.dependencies.keyId ?? "";
      const keySecret = this.dependencies.keySecret ?? "";
      const mode = this.dependencies.mode ?? "TEST";
      const expectedPrefix = mode === "LIVE" ? "rzp_live_" : "rzp_test_";
      if (!keyId.startsWith(expectedPrefix) || !keySecret)
        throw new PaymentServiceError(
          "PAYMENT_NOT_CONFIGURED",
          "Payment is temporarily unavailable.",
          503,
        );
      return { keyId, keySecret, mode };
    }
    try {
      return await resolveRazorpayCredentials();
    } catch {
      throw new PaymentServiceError(
        "PAYMENT_NOT_CONFIGURED",
        "Payment is temporarily unavailable.",
        503,
      );
    }
  }

  async createOrder(input: {
    generationJobId: string;
    templateId: PortraitTemplate;
    sessionId: string;
  }): Promise<PublicPaymentOrder> {
    const terms = paymentTerms();
    const credentials = await this.credentials();
    const current = await this.storage.getPayment(input.generationJobId);
    if (current && paymentMode(current) !== credentials.mode)
      throw new PaymentServiceError(
        "PAYMENT_MODE_CHANGED",
        "Payment mode changed. Please restart checkout.",
        409,
      );
    if (current?.razorpayOrderId)
      return this.publicOrder(current, credentials.keyId, input);
    if (current?.status === "CREATED")
      throw new PaymentServiceError(
        "PAYMENT_PENDING",
        "Payment setup is still in progress. Please try again.",
        409,
      );
    const now = this.now();
    const record: PaymentRecord = current ?? {
      id: input.generationJobId,
      generationJobId: input.generationJobId,
      templateId: input.templateId,
      sessionId: input.sessionId,
      ...terms,
      razorpayMode: credentials.mode,
      status: "CREATED",
      createdAt: now,
      expiresAt: now + PAYMENT_RETENTION_MS,
    };
    this.assertOwnership(record, input);
    const created = current ? true : await this.storage.createPayment(record);
    if (!created) {
      const concurrent = await this.storage.getPayment(record.id);
      if (concurrent) return this.publicOrder(concurrent, credentials.keyId, input);
      throw new PaymentServiceError(
        "PAYMENT_UNAVAILABLE",
        "Payment is temporarily unavailable.",
        503,
      );
    }
    const api = this.dependencies.razorpay ?? new RazorpayClient(credentials);
    let order;
    try {
      order = await api.createOrder({
        ...terms,
        receipt: input.generationJobId,
      });
      if (order.amount !== terms.amount || order.currency !== terms.currency)
        throw new PaymentServiceError(
          "PAYMENT_PROVIDER_INVALID",
          "Payment is temporarily unavailable.",
          502,
        );
    } catch (error) {
      await this.storage.savePayment({ ...record, status: "FAILED" });
      throw error;
    }
    const saved = { ...record, status: "CREATED" as const, razorpayOrderId: order.id };
    await this.storage.savePayment(saved);
    return this.publicOrder(saved, credentials.keyId, input);
  }

  private publicOrder(
    record: PaymentRecord,
    keyId: string,
    input: { templateId: PortraitTemplate; sessionId: string },
  ): PublicPaymentOrder {
    this.assertOwnership(record, input);
    if (!record.razorpayOrderId)
      throw new PaymentServiceError(
        "PAYMENT_PENDING",
        "Payment setup is still in progress. Please try again.",
        409,
      );
    return {
      paymentId: record.id,
      razorpayOrderId: record.razorpayOrderId,
      razorpayKeyId: keyId,
      amount: record.amount,
      currency: record.currency,
      displayAmount: formatPrice(record.amount, record.currency),
      paid: record.status === "PAID",
    };
  }

  private assertOwnership(
    record: PaymentRecord,
    input: { templateId: PortraitTemplate; sessionId: string },
  ) {
    if (
      record.sessionId !== input.sessionId ||
      record.templateId !== input.templateId ||
      record.amount !== pricing.offer.amountMinor ||
      record.currency !== "INR"
    )
      throw new PaymentServiceError(
        "FORBIDDEN",
        "This payment could not be verified.",
        403,
      );
  }

  async verify(input: {
    paymentId: string;
    razorpayPaymentId: string;
    razorpayOrderId: string;
    razorpaySignature: string;
    sessionId: string;
  }) {
    const record = await this.storage.getPayment(input.paymentId);
    if (!record || record.sessionId !== input.sessionId || !record.razorpayOrderId)
      throw new PaymentServiceError(
        "FORBIDDEN",
        "This payment could not be verified.",
        403,
      );
    if (record.status === "PAID") {
      if (record.razorpayPaymentId !== input.razorpayPaymentId)
        throw new PaymentServiceError(
          "FORBIDDEN",
          "This payment could not be verified.",
          403,
        );
      return record;
    }
    const credentials = await this.credentials();
    if (paymentMode(record) !== credentials.mode)
      throw new PaymentServiceError(
        "PAYMENT_MODE_CHANGED",
        "Payment mode changed. Please restart checkout.",
        409,
      );
    const expected = await signature(
      record.razorpayOrderId,
      input.razorpayPaymentId,
      credentials.keySecret,
    );
    const valid =
      input.razorpayOrderId === record.razorpayOrderId &&
      secureEqual(expected, input.razorpaySignature.toLowerCase());
    if (!valid) {
      await this.storage.savePayment({ ...record, status: "VERIFICATION_FAILED" });
      throw new PaymentServiceError(
        "PAYMENT_VERIFICATION_FAILED",
        "Payment verification failed.",
        400,
      );
    }
    const api = this.dependencies.razorpay ?? new RazorpayClient(credentials);
    let providerPayment;
    try {
      providerPayment = await api.fetchPayment(input.razorpayPaymentId);
    } catch {
      throw new PaymentServiceError(
        "PAYMENT_CONFIRMATION_UNAVAILABLE",
        "Your payment is being confirmed. Please try again shortly.",
        503,
      );
    }
    if (
      providerPayment.id !== input.razorpayPaymentId ||
      providerPayment.orderId !== record.razorpayOrderId ||
      providerPayment.amount !== record.amount ||
      providerPayment.currency !== record.currency
    ) {
      await this.storage.savePayment({ ...record, status: "VERIFICATION_FAILED" });
      throw new PaymentServiceError(
        "PAYMENT_VERIFICATION_FAILED",
        "Payment verification failed.",
        400,
      );
    }
    if (providerPayment.status !== "captured" || !providerPayment.captured)
      throw new PaymentServiceError(
        "PAYMENT_NOT_CAPTURED",
        "Your payment is authorized but not captured yet. Please try again shortly.",
        409,
      );
    const paid = {
      ...record,
      status: "PAID" as const,
      razorpayPaymentId: input.razorpayPaymentId,
      paidAt: this.now(),
    };
    await this.storage.savePayment(paid);
    return paid;
  }
}

export function isPaidForGeneration(
  record: PaymentRecord | null,
  input: {
    sessionId: string;
    generationJobId: string;
    templateId: string;
  },
) {
  return Boolean(
    record &&
    record.status === "PAID" &&
    record.sessionId === input.sessionId &&
    record.generationJobId === input.generationJobId &&
    record.templateId === input.templateId &&
    record.amount === pricing.offer.amountMinor &&
    record.currency === "INR",
  );
}
