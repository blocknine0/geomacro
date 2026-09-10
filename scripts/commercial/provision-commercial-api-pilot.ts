import { createHash } from "node:crypto";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import {
  GEOMACRO_ACCESS_TIERS,
  GEOMACRO_CREDIT_CONTRACT_VERSION,
} from "../../src/lib/commercial-access-contract";
import {
  STRUCTURED_DATA_REGISTRY_VERSION,
  STRUCTURED_TIER_REGISTRY,
  type CommercialOfferId,
} from "../../src/lib/structured-data-entitlement-registry";

const AUTHORITATIVE_PROJECT_REF = "ldpwajisioljyjtojvfx";
const ALLOWED_API_TIERS = new Set(["api_pilot", "institutional"]);

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

function canonicalOfferForTier(tier: "api_pilot" | "institutional"): CommercialOfferId {
  return tier === "api_pilot"
    ? "api_risk_gate_pilot_30d"
    : "institutional_contract";
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
  if (!ALLOWED_API_TIERS.has(tier)) {
    throw new Error(`Unsupported commercial API tier: ${tier}. Free and Analyst are not API-entitled.`);
  }
  const typedTier = tier as "api_pilot" | "institutional";
  const tierPolicy = STRUCTURED_TIER_REGISTRY[typedTier];
  if (!tierPolicy.api_access) throw new Error(`Tier ${tier} is not API-enabled by the canonical registry`);
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

  const offerId = canonicalOfferForTier(typedTier);
  const keyHash = sha256(apiKey);
  const keyId = `gmk_${keyHash.slice(0, 24)}`;
  const tierConfig = GEOMACRO_ACCESS_TIERS[typedTier];
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
    offer_id: offerId,
    included_credits: includedCredits,
    registry_version: STRUCTURED_DATA_REGISTRY_VERSION,
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

  const existingPrincipal = await db
    .from("commercial_principals")
    .select("id,principal_type,external_id,display_name,status")
    .eq("principal_type", "api_client")
    .eq("external_id", externalId)
    .maybeSingle();
  if (existingPrincipal.error) throw existingPrincipal.error;

  let principal = existingPrincipal.data;
  if (principal) {
    if (principal.status !== "active") {
      throw new Error("Existing principal is not active; refusing implicit reactivation");
    }
    if (principal.display_name !== displayName) {
      const updateName = await db
        .from("commercial_principals")
        .update({ display_name: displayName, updated_at: new Date().toISOString() })
        .eq("id", principal.id)
        .eq("status", "active")
        .select("id,principal_type,external_id,display_name,status")
        .single();
      if (updateName.error) throw updateName.error;
      principal = updateName.data;
    }
  } else {
    const insertPrincipal = await db
      .from("commercial_principals")
      .insert({
        principal_type: "api_client",
        external_id: externalId,
        display_name: displayName,
        status: "active",
      })
      .select("id,principal_type,external_id,display_name,status")
      .single();
    if (insertPrincipal.error) throw insertPrincipal.error;
    principal = insertPrincipal.data;
  }

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
    .select("id,principal_id,tier,included_credits,contract_version,source_type,source_reference,status,starts_at,ends_at,metadata")
    .eq("source_reference", reference)
    .eq("contract_version", GEOMACRO_CREDIT_CONTRACT_VERSION);
  if (existingGrant.error) throw existingGrant.error;

  const grantRows = existingGrant.data ?? [];
  if (grantRows.length > 1) {
    throw new Error("Entitlement reference is not unique");
  }
  if (grantRows.length === 1) {
    const row = grantRows[0];
    const now = Date.now();
    const startsAt = Date.parse(row.starts_at);
    const endsAt = Date.parse(row.ends_at);
    if (
      row.principal_id !== principal.id ||
      row.tier !== tier ||
      row.included_credits !== includedCredits ||
      row.source_type !== "manual_pilot"
    ) {
      throw new Error("Entitlement reference conflict: refusing to change existing commercial terms");
    }
    if (
      row.status !== "active" ||
      !Number.isFinite(startsAt) ||
      !Number.isFinite(endsAt) ||
      startsAt > now ||
      endsAt <= now
    ) {
      throw new Error("Existing entitlement is not currently active; refusing implicit renewal/reactivation");
    }
    if (
      row.metadata?.structured_data_registry_version !== STRUCTURED_DATA_REGISTRY_VERSION ||
      row.metadata?.offer_id !== offerId
    ) {
      throw new Error("Existing entitlement uses a different canonical offer or registry version");
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
        offer_id: offerId,
        entitlement_kind: typedTier === "institutional" ? "contract" : "subscription",
        structured_data_registry_version: STRUCTURED_DATA_REGISTRY_VERSION,
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
