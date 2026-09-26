import { createClient } from "@supabase/supabase-js";

const SOURCE_ID = "world_bank_indicators";
const EXPECTED_PROJECT_REF = "ldpwajisioljyjtojvfx";

function requiredEnv(name, aliases = []) {
  for (const candidate of [name, ...aliases]) {
    const value = String(process.env[candidate] ?? "").trim();
    if (value) return value;
  }
  throw new Error(`${name}_REQUIRED`);
}

function projectRef(url) {
  try {
    return new URL(url).hostname.split(".")[0] ?? "";
  } catch {
    return "";
  }
}

const url = requiredEnv("APP_SUPABASE_URL", ["SUPABASE_URL"]);
const key = requiredEnv("APP_SUPABASE_SERVICE_ROLE_KEY", ["SUPABASE_SERVICE_ROLE_KEY"]);

if (projectRef(url) !== EXPECTED_PROJECT_REF) {
  throw new Error("NON_AUTHORITATIVE_SUPABASE_PROJECT");
}

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const sourceResult = await db
  .from("live_external_sources")
  .select(
    "source_id,commercial_usage_status,raw_redistribution_allowed,attribution_required,enabled_for_ingestion,enabled_for_commercial_signals",
  )
  .eq("source_id", SOURCE_ID)
  .maybeSingle();

if (sourceResult.error) throw sourceResult.error;
if (!sourceResult.data) throw new Error("WDI_SOURCE_REGISTRATION_MISSING");

const source = sourceResult.data;
const governedPreconditions =
  source.source_id === SOURCE_ID &&
  source.commercial_usage_status === "COMMERCIAL_OK" &&
  source.raw_redistribution_allowed === true &&
  source.attribution_required === true &&
  source.enabled_for_ingestion === true;

if (!governedPreconditions) {
  console.error(
    JSON.stringify(
      {
        source_id: SOURCE_ID,
        repaired: false,
        reason: "GOVERNED_PRECONDITION_FAILED",
        commercial_usage_status: source.commercial_usage_status,
        raw_redistribution_allowed: source.raw_redistribution_allowed === true,
        attribution_required: source.attribution_required === true,
        enabled_for_ingestion: source.enabled_for_ingestion === true,
      },
      null,
      2,
    ),
  );
  throw new Error("WDI_COMMERCIAL_SIGNAL_REPAIR_BLOCKED");
}

let repaired = false;
if (source.enabled_for_commercial_signals !== true) {
  const updateResult = await db
    .from("live_external_sources")
    .update({
      enabled_for_commercial_signals: true,
      updated_at: new Date().toISOString(),
    })
    .eq("source_id", SOURCE_ID)
    .eq("commercial_usage_status", "COMMERCIAL_OK")
    .eq("raw_redistribution_allowed", true)
    .eq("attribution_required", true)
    .eq("enabled_for_ingestion", true)
    .select("source_id,enabled_for_commercial_signals")
    .maybeSingle();

  if (updateResult.error) throw updateResult.error;
  if (!updateResult.data?.enabled_for_commercial_signals) {
    throw new Error("WDI_COMMERCIAL_SIGNAL_REPAIR_DID_NOT_APPLY");
  }
  repaired = true;
}

const verifyResult = await db
  .from("live_external_sources")
  .select(
    "source_id,commercial_usage_status,raw_redistribution_allowed,attribution_required,enabled_for_ingestion,enabled_for_commercial_signals",
  )
  .eq("source_id", SOURCE_ID)
  .maybeSingle();

if (verifyResult.error) throw verifyResult.error;
const verified = verifyResult.data;
if (
  !verified ||
  verified.commercial_usage_status !== "COMMERCIAL_OK" ||
  verified.raw_redistribution_allowed !== true ||
  verified.attribution_required !== true ||
  verified.enabled_for_ingestion !== true ||
  verified.enabled_for_commercial_signals !== true
) {
  throw new Error("WDI_COMMERCIAL_SIGNAL_POSTCONDITION_FAILED");
}

console.log(
  JSON.stringify(
    {
      schema_version: "geomacro-wdi-commercial-signal-state-v1",
      source_id: SOURCE_ID,
      authoritative_project_verified: true,
      governed_preconditions_verified: true,
      repaired,
      enabled_for_commercial_signals: true,
      rights_broadened: false,
      raw_redistribution_changed: false,
      payment_performed: false,
      mainnet_activation_changed: false,
      execution_authorized: false,
    },
    null,
    2,
  ),
);
console.log("PASS: WORLD BANK COMMERCIAL SIGNAL STATE VERIFIED");
