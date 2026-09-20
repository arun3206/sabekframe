import type { PortraitTemplate } from "@/features/portrait-flow/types";
import type { RazorpayMode } from "@/server/payments/razorpay-credentials";

export type PaymentStatus = "CREATED" | "PAID" | "FAILED" | "VERIFICATION_FAILED";

export interface PaymentRecord {
  id: string;
  generationJobId: string;
  templateId: PortraitTemplate;
  sessionId: string;
  amount: number;
  currency: "INR";
  status: PaymentStatus;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpayMode?: RazorpayMode;
  lastRazorpayEventId?: string;
  createdAt: number;
  paidAt?: number;
  expiresAt: number;
}

export interface PublicPaymentOrder {
  paymentId: string;
  razorpayOrderId: string;
  razorpayKeyId: string;
  amount: number;
  currency: "INR";
  displayAmount: string;
  paid: boolean;
}
