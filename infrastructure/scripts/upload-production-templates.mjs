import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const region = "ap-south-1";
const accountId = "867982505694";
const stackName = "YaadonPhotoStorage-production";
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.resolve(
  scriptDirectory,
  "../../templates/janmashtami/mother-daughter-radha-001/template.jpeg",
);
const templateKey = "templates/janmashtami/mother-daughter-radha-001/template.jpeg";

function runAws(argumentsList, captureOutput = false) {
  const result = spawnSync("aws", argumentsList, {
    encoding: "utf8",
    shell: false,
    stdio: captureOutput ? ["ignore", "pipe", "inherit"] : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`AWS CLI exited with status ${result.status ?? "unknown"}.`);
  return captureOutput ? result.stdout.trim() : "";
}

const activeAccountId = runAws(
  ["sts", "get-caller-identity", "--query", "Account", "--output", "text"],
  true,
);
if (activeAccountId !== accountId)
  throw new Error(`Refusing to upload templates to AWS account ${activeAccountId}.`);

const bucketName = runAws(
  [
    "cloudformation",
    "describe-stacks",
    "--stack-name",
    stackName,
    "--region",
    region,
    "--query",
    "Stacks[0].Outputs[?OutputKey=='SanitizedUploadsBucketName'].OutputValue | [0]",
    "--output",
    "text",
  ],
  true,
);

if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucketName))
  throw new Error("The production sanitized-upload bucket could not be resolved.");

runAws([
  "s3",
  "cp",
  templatePath,
  `s3://${bucketName}/${templateKey}`,
  "--region",
  region,
  "--content-type",
  "image/jpeg",
  "--cache-control",
  "private, max-age=3600",
  "--only-show-errors",
]);

runAws([
  "s3api",
  "head-object",
  "--bucket",
  bucketName,
  "--key",
  templateKey,
  "--region",
  region,
  "--query",
  "{ContentLength:ContentLength,ContentType:ContentType}",
]);

console.log(`Uploaded and verified private template: ${templateKey}`);
