#!/usr/bin/env bun
import { readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { publishSupabaseFreePublicIntelligence } from "../lib/supabase-free-public-intelligence-publisher.mjs";
import { createB2Client } from "./b2-s3-client.mjs";
import { publishB2VerifiedHotSnapshot } from "./publish-b2-verified-hot-snapshot.mjs";
import { approvedIndependentReviewerFromEnv } from "../../src/lib/independent-reviewer-authority.server.ts";

try {
  if (process.argv.length !== 3 || process.argv[2] !== "--verified-publication")
    throw new Error("SUPABASE_FREE_INTELLIGENCE_EXPLICIT_MODE_REQUIRED");
  if (process.env.SUPABASE_DB_URL || process.env.APP_SUPABASE_URL ||
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.APP_SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("SUPABASE_FREE_INTELLIGENCE_DB_CREDENTIALS_FORBIDDEN");
  // Reuse the pinned, separately approved existing reviewer authority. A
  // self-selected input key or the GRO signing key cannot authorize review.
  const trustedReviewerPublicKeyPem = approvedIndependentReviewerFromEnv();
  if (!trustedReviewerPublicKeyPem)
    throw new Error("SUPABASE_FREE_INTELLIGENCE_TRUSTED_REVIEW_AUTHORITY_REQUIRED");
  if (process.env.B2_ACCOUNT_QUOTA_REQUIRED !== "1" ||
      !process.env.D1_DATABASE_ID || !process.env.CLOUDFLARE_API_TOKEN ||
      !process.env.CLOUDFLARE_ACCOUNT_ID ||
      !/^[a-z][a-z0-9_-]{1,47}$/.test(process.env.B2_ACCOUNT_QUOTA_WORKFLOW_ID ?? "") ||
      !/^\d+$/.test(process.env.B2_REQUEST_BUDGET ?? "") ||
      Number(process.env.B2_REQUEST_BUDGET) > 12 ||
      !process.env.B2_KEY_ID || !process.env.B2_APPLICATION_KEY ||
      !/^\d{1,20}$/.test(process.env.GITHUB_RUN_ID ?? "") ||
      (process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN ?? "").length < 32)
    throw new Error("SUPABASE_FREE_INTELLIGENCE_GOVERNED_CONFIG_REQUIRED");
  const path = process.env.GEOMACRO_QUALIFIED_INTELLIGENCE_INPUT;
  const pin = process.env.GEOMACRO_QUALIFIED_INTELLIGENCE_SHA256;
  if (!path || !/^[a-f0-9]{64}$/.test(pin ?? "") ||
      statSync(path).size > 2 * 1024 * 1024)
    throw new Error("SUPABASE_FREE_INTELLIGENCE_PINNED_INPUT_REQUIRED");
  const bytes = readFileSync(path);
  if (createHash("sha256").update(bytes).digest("hex") !== pin)
    throw new Error("SUPABASE_FREE_INTELLIGENCE_INPUT_HASH_MISMATCH");
  const input = JSON.parse(bytes);
  if (Object.keys(input).length !== 2 || !Object.hasOwn(input, "rows") ||
      !Object.hasOwn(input, "eventPackages"))
    throw new Error("SUPABASE_FREE_INTELLIGENCE_INPUT_CONTRACT_INVALID");
  const result = await publishSupabaseFreePublicIntelligence({
    ...input,
    trustedReviewerPublicKeyPem,
    sourceRunId: process.env.GITHUB_RUN_ID,
    createArchiveClient: () => createB2Client({
      endpointUrl: "https://s3.us-east-005.backblazeb2.com",
      bucket: "geomacro-private-archive",
      accessKey: process.env.B2_KEY_ID, secretKey: process.env.B2_APPLICATION_KEY,
    }),
    promoteHotSnapshot: publishB2VerifiedHotSnapshot,
  });
  console.log(JSON.stringify(result));
} catch {
  // Never print original packages, private URLs or provider error bodies.
  console.error("SUPABASE_FREE_INTELLIGENCE_PUBLICATION_FAILED_CLOSED");
  process.exitCode = 1;
}
