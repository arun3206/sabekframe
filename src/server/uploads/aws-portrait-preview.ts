import { z } from "zod";
import { awsJsonRequest } from "@/server/aws/aws-sdk-lite";

const responseSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    previewKey: z.string().min(1),
    contentType: z.literal("image/jpeg"),
  }),
});

export async function createAwsPortraitPreview(outputKey: string, previewKey: string) {
  const region = process.env.AWS_REGION;
  const functionName = process.env.AWS_UPLOAD_FINALIZER_FUNCTION;
  if (!region || !functionName)
    throw new Error("AWS portrait preview generator is not configured.");

  const response = await awsJsonRequest(
    "lambda",
    region,
    `https://lambda.${region}.amazonaws.com/2015-03-31/functions/${encodeURIComponent(functionName)}/invocations`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operation: "create-portrait-preview",
        outputKey,
        previewKey,
      }),
    },
  );
  if (response.headers.get("x-amz-function-error"))
    throw new Error("AWS portrait preview generation failed.");
  return responseSchema.parse(await response.json()).data;
}
