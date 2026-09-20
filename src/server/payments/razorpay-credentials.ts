import { awsJsonRequest } from "@/server/aws/aws-sdk-lite";

export type RazorpayMode = "TEST" | "LIVE";

export interface RazorpayCredentials {
  keyId: string;
  keySecret: string;
  webhookSecret?: string;
  mode: RazorpayMode;
}

let cachedCredentials: Promise<RazorpayCredentials | null> | undefined;
let modeLogged = false;

export function resolveRazorpayMode(value = process.env.RAZORPAY_MODE): RazorpayMode {
  const mode = (value ?? "TEST").trim().toUpperCase();
  if (mode !== "TEST" && mode !== "LIVE")
    throw new Error("RAZORPAY_MODE must be TEST or LIVE.");
  return mode;
}

function validateCredentials(input: {
  keyId?: string;
  keySecret?: string;
  webhookSecret?: string;
  mode: RazorpayMode;
}): RazorpayCredentials | null {
  if (!input.keyId || !input.keySecret) return null;
  const expectedPrefix = input.mode === "LIVE" ? "rzp_live_" : "rzp_test_";
  if (!input.keyId.startsWith(expectedPrefix))
    throw new Error(
      `Razorpay ${input.mode} credentials do not match the configured mode.`,
    );
  if (input.mode === "LIVE" && !input.webhookSecret)
    throw new Error("Razorpay LIVE mode requires a webhook secret.");
  return {
    keyId: input.keyId,
    keySecret: input.keySecret,
    webhookSecret: input.webhookSecret || undefined,
    mode: input.mode,
  };
}

async function readAwsCredentials(
  mode: RazorpayMode,
): Promise<RazorpayCredentials | null> {
  const secretId =
    process.env.AWS_RAZORPAY_SECRET_ID ?? process.env.AWS_RAZORPAY_TEST_SECRET_ID;
  const region = process.env.AWS_REGION;
  if (!secretId || !region) return null;
  const response = await awsJsonRequest(
    "secretsmanager",
    region,
    `https://secretsmanager.${region}.amazonaws.com/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": "secretsmanager.GetSecretValue",
      },
      body: JSON.stringify({ SecretId: secretId }),
    },
  );
  const result = (await response.json()) as { SecretString?: string };
  const parsed: unknown = result.SecretString ? JSON.parse(result.SecretString) : null;
  if (!parsed || typeof parsed !== "object") return null;
  const values = parsed as Record<string, unknown>;
  return validateCredentials({
    keyId:
      typeof values.RAZORPAY_KEY_ID === "string" ? values.RAZORPAY_KEY_ID : undefined,
    keySecret:
      typeof values.RAZORPAY_KEY_SECRET === "string"
        ? values.RAZORPAY_KEY_SECRET
        : undefined,
    webhookSecret:
      typeof values.RAZORPAY_WEBHOOK_SECRET === "string"
        ? values.RAZORPAY_WEBHOOK_SECRET
        : undefined,
    mode,
  });
}

export async function resolveRazorpayCredentials(): Promise<RazorpayCredentials> {
  const mode = resolveRazorpayMode();
  const direct = validateCredentials({
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
    mode,
  });
  const credentials =
    direct ?? (await (cachedCredentials ??= readAwsCredentials(mode).catch(() => null)));
  if (!credentials) throw new Error(`Razorpay ${mode} Mode is not configured.`);
  if (!modeLogged) {
    console.info(`Razorpay mode: ${mode}`);
    modeLogged = true;
  }
  return credentials;
}
