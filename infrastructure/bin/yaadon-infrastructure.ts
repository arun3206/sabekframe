#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { PhotoStorageStack } from "../lib/photo-storage-stack.js";

const app = new App();
const environment = app.node.tryGetContext("environment") ?? "dev";
const allowedOrigins = String(
  app.node.tryGetContext("allowedOrigins") ?? "http://localhost:3000",
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const region = app.node.tryGetContext("region") ?? "ap-south-1";
const account = app.node.tryGetContext("account") ?? process.env.CDK_DEFAULT_ACCOUNT;

if (
  environment !== "dev" &&
  allowedOrigins.some((origin) => origin.includes("localhost"))
) {
  throw new Error("A deployed HTTPS application origin is required outside development.");
}

if (!allowedOrigins.length)
  throw new Error("At least one application origin is required.");

new PhotoStorageStack(app, `YaadonPhotoStorage-${environment}`, {
  environmentName: environment,
  allowedOrigins,
  env: {
    account,
    region,
  },
  terminationProtection: environment === "production",
  description: `Private Yaadon photo storage for the ${environment} environment`,
});
