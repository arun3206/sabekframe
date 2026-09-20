import { z } from "zod";
import { portraitTemplateSchema } from "@/features/portrait-flow/validation/flow";

export const createPaymentOrderSchema = z
  .object({
    generationJobId: z.string().uuid(),
    templateId: portraitTemplateSchema,
  })
  .strict();

export const verifyPaymentSchema = z
  .object({
    paymentId: z.string().uuid(),
    razorpayPaymentId: z.string().min(1).max(100),
    razorpayOrderId: z.string().min(1).max(100),
    razorpaySignature: z.string().regex(/^[a-f0-9]{64}$/i),
  })
  .strict();

export function paymentError(code: string, message: string, status: number) {
  return Response.json({ ok: false, error: { code, message } }, { status });
}
