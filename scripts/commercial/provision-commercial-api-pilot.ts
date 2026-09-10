import { createHash } from "node:crypto";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import {
  GEOMACRO_ACCESS_TIERS,
  GEOMACRO_CREDIT_CONTRACT_VERSION,
} from "../../src/lib/commercial-access-contract";

const AUTHORITATIVE_PROJECT_REF = "ldpwajisioljyjtojvfx";
const ALLOWED_TIERS = new Set(["analyst_pilot", "api_pilot", "institutional"]);

function required(name: string): string {
  const value = String(process.env[name] ?? "").trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function projectRefOf(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    const suffix = ".supabase.co";
    return host.endsWith(suffix) ? host.slice(0, -suffix.length) || null : null;
  } catch {
    return null;
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function main() {
  const write = process.argv.includes("--write");
  const url = required("APP_SUPABASE_URL");
  const serviceRole = required("APP_SUPABASE_SERVICE_ROLE_KEY");
  const apiKey = required("COMMERCIAL_PILOT_API_KEY");
  const externalId = required("COMMERCIAL_PILOT_EXTERNAL_ID");
  const displayName = String(process.env.COMMERCIAL_PILOT_DISPLAY_NAME ?? externalId).trim();
  const tier = String(process.env.COMMERCIAL_PILOT_TIER ?? "api_pilot").trim();
  const reference = required("COMMERCIAL_PILOT_REFERENCE");
  const durationDays = Number(process.env.COMMERCIAL_PILOT_DURATION_DAYS ?? "30");

  if (projectRefOf(url) !== AUTHORITATIVE_PROJECT_REF) {
    throw new Error("Refusing to provision outside the authoritative Geomacro Supabase project");
  }
  if (!ALLOWED_TIERS.has(tier)) throw new Error(`Unsupported pilot tier: ${tier}`);
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 366) {
    throw new Error("COMMERCIAL_PILOT_DURATION_DAYS must be an integer between 1 and 366");
  }
  if (apiKey.length < 32 || apiKey.length > 256) {
    throw new Error("COMMERCIAL_PILOT_API_KEY must be 32-256 characters");
  }
  if (externalId.length < 3 || externalId.length > 256) {
    throw new Error("COMMERCIAL_PILOT_EXTERNAL_ID must be 3-256 characters");
  }
  if (!/^[A-Za-z0-9._:@/+\-=]+$/.test(reference) || reference.length > 160) {
    throw new Error("COMMERCIAL_PILOT_REFERENCE must be a bounded non-secret reference token");
  }

  const keyHash = sha256(apiKey);
  const keyId = `gmk_${keyHash.slice(0, 24)}`;
  const tierConfig = GEOMACRO_ACCESS_TIERS[tier as keyof typeof GEOMACRO_ACCESS_TIERS];
  const includedCredits = "credits_per_30_days" in tierConfig
    ? tierConfig.credits_per_30_days
    : tierConfig.credits_per_month_starting_pool;

  const plan = {
    ok: true,
    mode: write ? "write" : "dry_run",
    project_ref: AUTHORITATIVE_PROJECT_REF,
    principal_type: "api_client",
    external_id: externalId,
    display_name: displayName,
    key_id: keyId,
    api_key_hash_prefix: keyHash.slice(0, 12),
    tier,
    included_credits: includedCredits,
    contract_version: GEOMACRO_CREDIT_CONTRACT_VERSION,
    source_type: "manual_pilot",
    source_reference: reference,
    duration_days: durationDays,
    raw_api_key_logged: false,
  };

  if (!write) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  const db = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const principalResult = await db
    .from("commercial_principals")
    .upsert(
      {
        principal_type: "api_client",
        external_id: externalId,
        display_name: displayName,
        status: "active",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "principal_type,external_id" },
    )
    .select("id,principal_type,external_id,status")
    .single();
  if (principalResult.error) throw principalResult.error;
  const principal = principalResult.data;

  const existingCredential = await db
    .from("commercial_api_credentials")
    .select("id,principal_id,key_id,api_key_hash,enabled,revoked_at")
    .or(`key_id.eq.${keyId},api_key_hash.eq.${keyHash}`);
  if (existingCredential.error) throw existingCredential.error;

  const credentialRows = existingCredential.data ?? [];
  if (credentialRows.length > 1) {
    throw new Error("Credential identity conflict: key id/hash resolve to different records");
  }
  if (credentialRows.length === 1) {
    const row = credentialRows[0];
    if (
      row.principal_id !== principal.id ||
      row.key_id !== keyId ||
      row.api_key_hash !== keyHash ||
      row.revoked_at !== null
    ) {
      throw new Error("Credential identity conflict: refusing to mutate an existing credential");
    }
    if (!row.enabled) {
      throw new Error("Existing credential is disabled; refusing implicit re-enable");
    }
  } else {
    const insertCredential = await db.from("commercial_api_credentials").insert({
      principal_id: principal.id,
      key_id: keyId,
      api_key_hash: keyHash,
      enabled: true,
      scopes: ["commercial:read"],
    });
    if (insertCredential.error) throw insertCredential.error;
  }

  const existingGrant = await db
    .from("commercial_entitlement_grants")
    .select("id,principal_id,tier,included_credits,contract_version,source_type,source_reference,status,ends_at")
    .eq("source_reference", reference)
    .eq("contract_version", GEOMACRO_CREDIT_CONTRACT_VERSION);
  if (existingGrant.error) throw existingGrant.error;

  const grantRows = existingGrant.data ?? [];
  if (grantRows.length > 1) {
    throw new Error("Entitlement reference is not unique");
  }
  if (grantRows.length === 1) {
    const row = grantRows[0];
    if (
      row.principal_id !== principal.id ||
      row.tier !== tier ||
      row.included_credits !== includedCredits ||
      row.source_type !== "manual_pilot"
    ) {
      throw new Error("Entitlement reference conflict: refusing to change existing commercial terms");
    }
  } else {
    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + durationDays * 86_400_000);
    const insertGrant = await db.from("commercial_entitlement_grants").insert({
      principal_id: principal.id,
      tier,
      included_credits: includedCredits,
      contract_version: GEOMACRO_CREDIT_CONTRACT_VERSION,
      source_type: "manual_pilot",
      source_reference: reference,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      status: "active",
      metadata: {
        provisioner: "provision-commercial-api-pilot-v1",
        execution_authorized: false,
      },
    });
    if (insertGrant.error) throw insertGrant.error;
  }

  console.log(JSON.stringify({
    ...plan,
    principal_id: principal.id,
    provisioned: true,
  }, null, 2));
}

main().catch((error) => {
  console.error(`Commercial API pilot provisioning failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
