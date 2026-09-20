import { getActivePortraitTemplate } from "@/config/portrait-templates";
import { createPaymentOrderSchema, paymentError } from "@/server/payments/contracts";
import { PaymentService, PaymentServiceError } from "@/server/payments/payment-service";
import { getAnonymousSession, isSameOrigin } from "@/server/security/anonymous-session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return paymentError("FORBIDDEN", "This request could not be verified.", 403);
  const parsed = createPaymentOrderSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return paymentError("BAD_REQUEST", "The payment details were invalid.", 400);
  const template = getActivePortraitTemplate(parsed.data.templateId);
  if (!template)
    return paymentError("INVALID_TEMPLATE", "Unknown or inactive templateId.", 400);
  try {
    const order = await new PaymentService().createOrder({
      ...parsed.data,
      sessionId: await getAnonymousSession(),
    });
    return Response.json(
      { ok: true, data: order },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof PaymentServiceError)
      return paymentError(error.code, error.message, error.httpStatus);
    return paymentError(
      "PAYMENT_UNAVAILABLE",
      "Payment is temporarily unavailable.",
      503,
    );
  }
}
