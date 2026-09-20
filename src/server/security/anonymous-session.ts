import { cookies } from "next/headers";

const COOKIE_NAME = "yaadon_anonymous_session";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

export async function getAnonymousSession(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(COOKIE_NAME)?.value;
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;

  const sessionId = crypto.randomUUID();
  cookieStore.set(COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: THIRTY_DAYS,
  });
  return sessionId;
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production";
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}
