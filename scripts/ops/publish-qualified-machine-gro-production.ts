#!/usr/bin/env bun
/**
 * Permanent, event-triggered GRO 1.1 production path:
 * immutable existing machine-qualified B2 request -> independent authority
 * revalidation -> country-risk scoring -> Ed25519 signing -> full B2 archive
 * readback -> canonical D1 hot/index publication -> authenticated live readback.
 *
 * No fake source rights, no source timestamp resets, no public evidence leak,
 * no Supabase/PREDGE interaction and no x402/USDC settlement.
 */
import { createHash } from "node:crypto";
import {
  chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createB2Client } from "./b2-s3-client.mjs";
import {
  machineCommercialAuthorityConfigurationValid,
} from "../../src/lib/geomacro-machine-commercial-qualification.server";
import { acceptMachineCommercialPrivateGRO } from "./accept-private-geomacro-machine-commercial-gro";
import { promoteOwnerPrivateGRO } from "./publish-private-signed-gro-d1";
import { readD1VerifiedHotCountryGro } from "../../src/lib/d1-country-gro-hot.server";
import { canonicalRiskObjectJson } from "../../src/lib/risk-object-signing.server";

const FAIL = "QUALIFIED_MACHINE_GRO_PRODUCTION_NOT_VERIFIED";
const PREFIX = "geomacro-evidence/v1/private/machine-gro-qualified/";
const SHA256 = /^[a-f0-9]{64}$/u;
const B2_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const MAX_INPUT_BYTES = 1024 * 1024;
const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

export function parsePinnedMachineGroInput(
  key: unknown, digest: unknown,
): { key: string; sha256: string } {
  const sha256 = String(digest ?? "");
  const candidate = String(key ?? "");
  if (!SHA256.test(sha256) ||
      candidate !== PREFIX + sha256 + ".json" ||
      candidate.length > 180) {
    throw Error("QUALIFIED_MACHINE_GRO_IMMUTABLE_INPUT_PIN_INVALID");
  }
  return {key:candidate, sha256};
}

export function verifyPinnedMachineGroBytes(
  bytes: Buffer, digest: string,
): void {
  if (!Buffer.isBuffer(bytes) || bytes.length < 100 ||
      bytes.length > MAX_INPUT_BYTES || hash(bytes) !== digest)
    throw Error("QUALIFIED_MACHINE_GRO_INPUT_SHA256_MISMATCH");
}

function requireProtectedProductionConfig() {
  if (process.env.GITHUB_ACTIONS !== "true" ||
      process.env.B2_ACCOUNT_QUOTA_REQUIRED !== "1" ||
      process.env.GEOMACRO_DIRECT_GRO_PUBLISH_ACK !== "YES" ||
      !/^\d{1,20}$/u.test(process.env.GITHUB_RUN_ID ?? "") ||
      !/^[a-z][a-z0-9_-]{1,47}$/u.test(process.env.B2_ACCOUNT_QUOTA_WORKFLOW_ID ?? "") ||
      process.env.B2_REQUEST_BUDGET !== "4" ||
      (process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN ?? "").length < 32 ||
      !/^[a-f0-9]{32}$/iu.test(process.env.CLOUDFLARE_ACCOUNT_ID ?? "") ||
      !/^[0-9a-f-]{36}$/iu.test(process.env.D1_DATABASE_ID ?? "") ||
      (process.env.CLOUDFLARE_API_TOKEN ?? "").length < 20 ||
      !process.env.B2_KEY_ID || !process.env.B2_APPLICATION_KEY ||
      !process.env.RISK_OBJECT_SIGNING_KEY_ID ||
      !process.env.RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64 ||
      !process.env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64 ||
      !machineCommercialAuthorityConfigurationValid()) {
    throw Error("QUALIFIED_MACHINE_GRO_PRODUCTION_AUTHORITY_UNAVAILABLE");
  }
  for (const field of [
    "SUPABASE_DB_URL", "SUPABASE_URL", "APP_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY", "APP_SUPABASE_SERVICE_ROLE_KEY",
    "COINBASE_API_KEY", "COINBASE_COMMERCE_API_KEY",
  ]) {
    if (process.env[field]) throw Error("QUALIFIED_MACHINE_GRO_FORBIDDEN_CREDENTIAL_PRESENT");
  }
}

export async function publishPinnedMachineGroProduction(
  key: unknown, digest: unknown,
) {
  const pinned = parsePinnedMachineGroInput(key,digest);
  requireProtectedProductionConfig();
  // The private folder is temporary runner scratch only, not a temporary
  // deployment or bypass. The automation remains permanently installed.
  const root = mkdtempSync(join(process.env.RUNNER_TEMP ?? tmpdir(), "geomacro-qualified-gro-"));
  chmodSync(root,0o700);
  const originalDir = process.env.GEOMACRO_PRIVATE_REVIEW_DIR;
  process.env.GEOMACRO_PRIVATE_REVIEW_DIR = root;
  const inputPath = join(root,"qualified-input.json");
  const signedPath = join(root,"canonical-signed-gro.json");
  try {
    const b2=createB2Client({
      endpointUrl:B2_ENDPOINT,
      accessKey:process.env.B2_KEY_ID!,
      secretKey:process.env.B2_APPLICATION_KEY!,
      bucket:"geomacro-private-archive",
    });
    // Each B2 attempt consumes the existing D1 shared-account governor.
    const bytes=Buffer.from(await b2.get(pinned.key));
    verifyPinnedMachineGroBytes(bytes,pinned.sha256);
    writeFileSync(inputPath,bytes,{mode:0o600,flag:"wx"});

    // Independently verify fact/rights signatures, same-event corroboration,
    // source-native clock/bytes and source licence. This is NOT a flag flip.
    // Reuse the existing deterministic GRO scorer + canonical Ed25519 signer.
    const signed=await acceptMachineCommercialPrivateGRO(inputPath,signedPath);
    if (signed.status!=="MACHINE_COMMERCIAL_SIGNED_PRIVATE_NO_FUNDS")
      throw Error(FAIL);

    // Exact existing signed bytes: independently verified B2 PUT+GET BEFORE
    // the two canonical D1 writes, then independently read the D1 bytes.
    const published=await promoteOwnerPrivateGRO(signedPath);
    if (!published.ok || !published.d1_exact_readback_verified ||
        !published.b2_archive_readback_verified ||
        published.record_sha256 !== signed.record_sha256 ||
        published.country_iso3 !== signed.country_iso3)
      throw Error(FAIL);

    // Final serving check via the same authenticated production Worker path
    // used by machine buyers. Never infer this from an offline unit test.
    let hotFailure = "HOT_DIAGNOSTIC_UNCLASSIFIED";
    const hot=await readD1VerifiedHotCountryGro(
      signed.country_iso3,new Date().toISOString(),
      code => {hotFailure=code;},
    );
    if (!hot || hash(canonicalRiskObjectJson(hot)) !== signed.record_sha256)
      throw Error("QUALIFIED_MACHINE_GRO_HOT_" + hotFailure);

    return {
      ok:true,
      schema:"geomacro.qualified-machine-gro-production.v1",
      country_iso3:signed.country_iso3,
      category:signed.category,
      record_sha256:signed.record_sha256,
      gro_1_1_signed:true,
      b2_archive_readback_verified:true,
      canonical_d1_hot_readback_verified:true,
      live_worker_signed_hot_verified:true,
      payments_performed:false,
      payment_authorized:false,
      public_raw_evidence_disclosed:false,
    };
  } finally {
    // Never upload private events or signed JSON as Actions artifacts.
    rmSync(root,{recursive:true,force:true});
    if (originalDir === undefined) delete process.env.GEOMACRO_PRIVATE_REVIEW_DIR;
    else process.env.GEOMACRO_PRIVATE_REVIEW_DIR=originalDir;
  }
}

if (import.meta.main) {
  publishPinnedMachineGroProduction(
    process.env.GEOMACRO_MACHINE_GRO_INPUT_B2_KEY,
    process.env.GEOMACRO_MACHINE_GRO_INPUT_SHA256,
  ).then(result=>console.log(JSON.stringify(result)))
   .catch(error=>{
     // Only enumerated safe codes in CI: never output exception, issuer,
     // original pages, private keys or any protected object body.
     const code=error instanceof Error &&
       /^QUALIFIED_MACHINE_GRO_(?:IMMUTABLE_INPUT_PIN_INVALID|INPUT_SHA256_MISMATCH|PRODUCTION_AUTHORITY_UNAVAILABLE|FORBIDDEN_CREDENTIAL_PRESENT|HOT_[A-Z_]+)$/u.test(error.message)
         ?error.message:FAIL;
     console.error(code);
     process.exitCode=2;
   });
}
