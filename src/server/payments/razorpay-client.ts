import type { RazorpayCredentials } from "@/server/payments/razorpay-credentials";

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
}

export interface RazorpayOrderDetails extends RazorpayOrder {
  receipt: string;
  status: string;
}

export interface RazorpayPayment {
  id: string;
  orderId: string;
  amount: number;
  currency: string;
  status: string;
  captured: boolean;
}

export interface RazorpayApi {
  createOrder(input: {
    amount: number;
    currency: "INR";
    receipt: string;
  }): Promise<RazorpayOrder>;
  fetchPayment(paymentId: string): Promise<RazorpayPayment>;
  fetchOrder(orderId: string): Promise<RazorpayOrderDetails>;
}

export class RazorpayClient implements RazorpayApi {
  constructor(
    private readonly credentials: RazorpayCredentials,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async createOrder(input: { amount: number; currency: "INR"; receipt: string }) {
    const response = await this.fetcher("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${this.credentials.keyId}:${this.credentials.keySecret}`)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...input, partial_payment: false }),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok || !body || typeof body !== "object")
      throw new Error("Razorpay could not create an order.");
    const order = body as Record<string, unknown>;
    if (
      typeof order.id !== "string" ||
      typeof order.amount !== "number" ||
      typeof order.currency !== "string"
    )
      throw new Error("Razorpay returned an invalid order.");
    return { id: order.id, amount: order.amount, currency: order.currency };
  }

  async fetchPayment(paymentId: string): Promise<RazorpayPayment> {
    const response = await this.fetcher(
      `https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${btoa(`${this.credentials.keyId}:${this.credentials.keySecret}`)}`,
        },
      },
    );
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok || !body || typeof body !== "object")
      throw new Error("Razorpay could not confirm the payment.");
    const payment = body as Record<string, unknown>;
    if (
      typeof payment.id !== "string" ||
      typeof payment.order_id !== "string" ||
      typeof payment.amount !== "number" ||
      typeof payment.currency !== "string" ||
      typeof payment.status !== "string" ||
      typeof payment.captured !== "boolean"
    )
      throw new Error("Razorpay returned an invalid payment.");
    return {
      id: payment.id,
      orderId: payment.order_id,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      captured: payment.captured,
    };
  }

  async fetchOrder(orderId: string): Promise<RazorpayOrderDetails> {
    const response = await this.fetcher(
      `https://api.razorpay.com/v1/orders/${encodeURIComponent(orderId)}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${btoa(`${this.credentials.keyId}:${this.credentials.keySecret}`)}`,
        },
      },
    );
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok || !body || typeof body !== "object")
      throw new Error("Razorpay could not confirm the order.");
    const order = body as Record<string, unknown>;
    if (
      typeof order.id !== "string" ||
      typeof order.amount !== "number" ||
      typeof order.currency !== "string" ||
      typeof order.receipt !== "string" ||
      typeof order.status !== "string"
    )
      throw new Error("Razorpay returned an invalid order.");
    return {
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
      status: order.status,
    };
  }
}
