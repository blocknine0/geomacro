#!/usr/bin/env node
/**
 * Derive the existing Cloudflare Control Plane root token from the already
 * provisioned protected root secret. Output is intentionally only the derived
 * token on stdout so callers can pipe it directly to wrangler secret put.
 * Never log the token, the root, or arbitrary exceptions.
 */
import { createHmac } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function deriveControlPlaneRootToken(rootValue) {
  if (typeof rootValue !== "string") {
    throw new Error("CONTROL_PLANE_ROOT_TOKEN_REQUIRED");
  }
  const root = rootValue.trim();
  if (root.length < 32) {
    throw new Error("CONTROL_PLANE_ROOT_TOKEN_REQUIRED");
  }
  return createHmac("sha256", root)
    .update("geomacro-control-plane-v1")
    .digest("hex");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.stdout.write(deriveControlPlaneRootToken(process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN));
  } catch (error) {
    const code = error instanceof Error && error.message === "CONTROL_PLANE_ROOT_TOKEN_REQUIRED"
      ? error.message
      : "CONTROL_PLANE_TOKEN_DERIVATION_FAILED";
    process.stderr.write(code + "\n");
    process.exitCode = 2;
  }
}
