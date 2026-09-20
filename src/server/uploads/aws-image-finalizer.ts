import { z } from "zod";
import type { FaceBoundingBox, PhotoRole } from "@/features/photo-upload/types";
import type { FinalizedAssetSummary } from "@/server/uploads/storage";
import { awsJsonRequest } from "@/server/aws/aws-sdk-lite";

const lambdaResponseSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    data: z.object({
      assetId: z.string().uuid(),
      role: z.enum(["first", "second"]),
      validationStatus: z.enum(["pass", "warning-accepted"]),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    }),
  }),
  z.object({
    ok: z.literal(false),
    error: z.object({
      code: z.enum(["NOT_FOUND", "INVALID_IMAGE", "QUALITY_REJECTED"]),
      message: z.string().min(1),
      status: z.number().int().min(400).max(499),
    }),
  }),
]);

export type AwsFinalizeResult = z.infer<typeof lambdaResponseSchema>;

export async function finalizeAwsUpload(input: {
  uploadId: string;
  sessionId: string;
  relationship: string;
  role: PhotoRole;
  clientQualityStatus: "pass" | "warning-accepted";
  faceBoundingBox: FaceBoundingBox | null;
}): Promise<AwsFinalizeResult> {
  const region = process.env.AWS_REGION;
  const functionName = process.env.AWS_UPLOAD_FINALIZER_FUNCTION;
  if (!region || !functionName)
    throw new Error("AWS upload finalizer is not configured.");

  const response = await awsJsonRequest(
    "lambda",
    region,
    `https://lambda.${region}.amazonaws.com/2015-03-31/functions/${encodeURIComponent(functionName)}/invocations`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  if (response.headers.get("x-amz-function-error"))
    throw new Error("AWS upload finalizer failed.");
  const payload: unknown = await response.json();
  return lambdaResponseSchema.parse(payload);
}

export function finalizedAssetFromAwsResult(
  result: Extract<AwsFinalizeResult, { ok: true }>,
): FinalizedAssetSummary {
  return result.data;
}
