import { processRazorpayWebhook } from "@/server/payments/razorpay-webhook";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const signature = request.headers.get("x-razorpay-signature");
  const eventId = request.headers.get("x-razorpay-event-id");
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (
    !signature ||
    !/^[a-f0-9]{64}$/i.test(signature) ||
    !eventId ||
    eventId.length > 200 ||
    !Number.isFinite(contentLength) ||
    contentLength > 1_000_000
  )
    return Response.json({ ok: false }, { status: 400 });
  const rawBody = await request.text();
  if (rawBody.length > 1_000_000) return Response.json({ ok: false }, { status: 413 });
  try {
    const result = await processRazorpayWebhook(rawBody, signature, eventId);
    return Response.json({ ok: true, data: result });
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
}
