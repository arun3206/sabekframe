import { paymentError, verifyPaymentSchema } from "@/server/payments/contracts";
import { PaymentService, PaymentServiceError } from "@/server/payments/payment-service";
import { getAnonymousSession, isSameOrigin } from "@/server/security/anonymous-session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return paymentError("FORBIDDEN", "This request could not be verified.", 403);
  const parsed = verifyPaymentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return paymentError("BAD_REQUEST", "The verification details were invalid.", 400);
  try {
    await new PaymentService().verify({
      ...parsed.data,
      sessionId: await getAnonymousSession(),
    });
    return Response.json(
      { ok: true, data: { paid: true } },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof PaymentServiceError)
      return paymentError(error.code, error.message, error.httpStatus);
    return paymentError(
      "PAYMENT_UNAVAILABLE",
      "Payment verification is temporarily unavailable.",
      503,
    );
  }
}
