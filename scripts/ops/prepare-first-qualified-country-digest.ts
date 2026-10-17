import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";
import { canonicalJson } from "../../src/lib/canonical-json";
import { buildAgentQueryPlan, agentAdaptiveQuerySchema } from "../../src/lib/agent-query-plan";
import { checkAgentQueryDeliverability } from "../../src/lib/agent-query-deliverability.server";
import { assembleAgentQueryResponse } from "../../src/lib/agent-query-response.server";
import { loadQualifiedMcsCountryContext, MCS_DIGEST_CSV_SHA256 }
  from "../../src/lib/qualified-mcs-country-digest.server";
import { resolveGeomacroCapabilityPrice } from "../../src/lib/capability-pricing-catalog";
import { createB2Client } from "./b2-s3-client.mjs";

const sha = (v: string | Uint8Array) => createHash("sha256").update(v).digest("hex");
const country = process.env.GEOMACRO_FIRST_DIGEST_COUNTRY ?? "CHN";
if (!["USA", "CHN"].includes(country)) throw Error("FIRST_DIGEST_UNSUPPORTED_COUNTRY");
const persist = process.argv.includes("--archive-private");
// Never load frozen DB/payment credentials or real-money ACKs for this operation.
process.env.GEOMACRO_SUPABASE_RUNTIME_MODE = "standby";
for (const name of ["SUPABASE_DB_URL", "SUPABASE_SERVICE_ROLE_KEY", "APP_SUPABASE_SERVICE_ROLE_KEY",
  "HISTORICAL_SUPABASE_SERVICE_ROLE_KEY", "COINBASE_X402_MAINNET_ACK", "CIRCLE_X402_MAINNET_ACK",
  "GEOMACRO_COMMERCIAL_LAUNCH_ACK"]) {
  if (process.env[name]) throw Error("FIRST_DIGEST_FORBIDDEN_RUNTIME_CONFIG");
}
const context = await loadQualifiedMcsCountryContext(country);
if (!context) throw Error("FIRST_DIGEST_REAL_ORIGINAL_OR_COMPARABLE_COUNTRY_ROWS_UNAVAILABLE");
const plan = buildAgentQueryPlan(agentAdaptiveQuerySchema.parse({
  schema_version: "geomacro.agent-query.v1", delivery_tier: "structural_baseline",
  fulfillment_mode: "published_only", subjects: [{ type: "country", country_iso3: country }],
  topics: ["critical_minerals"], detail: "compact",
}));
const availability = await checkAgentQueryDeliverability(plan);
if (!availability.deliverable || availability.code !== "AVAILABLE" ||
    availability.source_contracts.length !== 1 || availability.source_contracts[0].attribution_required ||
    availability.missing_modules.length || availability.stale_modules.length || availability.ineligible_source_ids.length)
  throw Error("FIRST_DIGEST_CANONICAL_SOURCE_RIGHTS_OR_DELIVERABILITY_REJECTED");
const price = resolveGeomacroCapabilityPrice("structural_country_digest", "standard");
if (price.amount_atomic !== "20000") throw Error("FIRST_DIGEST_LOCKED_PRICE_MISMATCH");
const answer = await assembleAgentQueryResponse({ plan, requestId: "source-qualified:" + plan.query_plan_hash,
  priceUsdc: price.amount_usdc });
const customerBytes = canonicalJson(answer);
if (/sciencebase|datacite|usgs_mcs|source_url|source_id|input_row_hashes/iu.test(customerBytes) ||
    answer.signed_risk_objects.length || answer.gri_context !== null || answer.execution_authorized !== false)
  throw Error("FIRST_DIGEST_CUSTOMER_BOUNDARY_REJECTED");
const hash = sha(customerBytes);
const provenance = context.observations.map(row => row.provenance);
const checkedAt = context.observations[0].retrieved_at!;
const bundle = canonicalJson({ schema: "geomacro.qualified-structural-delivery-candidate.v1",
  country_iso3: country, topic: "critical_minerals", capability: price.capability,
  price_usdc: price.amount_usdc, price_atomic: price.amount_atomic,
  query_plan_hash: plan.query_plan_hash, prepared_answer_sha256: hash, customer_bytes: customerBytes,
  rights_checked_at: checkedAt, source_file_sha256: MCS_DIGEST_CSV_SHA256,
  private_provenance: provenance, reference_year: 2025, previous_reference_year: 2024,
  original_period_kind: "ANNUAL_NOT_CURRENT_NEWS", payment_authorized: false, settlement_verified: false });
let archived = false;
let key: string | null = null;
if (persist) {
  if (process.env.B2_ACCOUNT_QUOTA_REQUIRED !== "1" || process.env.B2_REQUEST_BUDGET !== "8")
    throw Error("FIRST_DIGEST_GOVERNED_ARCHIVE_REQUIRED");
  if (!process.env.D1_DATABASE_ID) {
    const account = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";
    if (!/^[a-f0-9]{32}$/u.test(account)) throw Error("FIRST_DIGEST_D1_ACCOUNT_REQUIRED");
    const res = await fetch("https://api.cloudflare.com/client/v4/accounts/" + account + "/d1/database?per_page=100", {
      headers: { authorization: "Bearer " + (process.env.CLOUDFLARE_API_TOKEN ?? "") },
      redirect: "manual", signal: AbortSignal.timeout(10_000) });
    const doc = await res.json();
    const rows = doc?.result?.filter((row: any) => row.name === "geomacro-control-plane");
    if (!res.ok || doc.success !== true || rows?.length !== 1) throw Error("FIRST_DIGEST_CANONICAL_D1_UNAVAILABLE");
    process.env.D1_DATABASE_ID = rows[0].uuid;
  }
  const b2 = createB2Client({ endpointUrl: "https://s3.us-east-005.backblazeb2.com", bucket: "geomacro-private-archive",
    accessKey: process.env.B2_KEY_ID, secretKey: process.env.B2_APPLICATION_KEY });
  const compressed = gzipSync(Buffer.from(bundle));
  key = "geomacro-evidence/v1/private/qualified-structural-digests/" + sha(bundle) + ".json.gz";
  const receipt = await b2.putWithMetadataVerification(key, compressed, { verifyRestored: (actual: Uint8Array) => {
    if (gunzipSync(actual).toString("utf8") !== bundle) throw Error("FIRST_DIGEST_EXACT_RESTORE_MISMATCH");
  } });
  const read = gunzipSync(await b2.get(key)).toString("utf8");
  const parsed = JSON.parse(read);
  if (!receipt.full_body_readback_verified || read !== bundle || parsed.customer_bytes !== customerBytes ||
      sha(parsed.customer_bytes) !== hash) throw Error("FIRST_DIGEST_INDEPENDENT_READBACK_MISMATCH");
  archived = true;
}
const receipt = { schema: "geomacro.first-qualified-structural-digest-receipt.v1", checked_at: new Date().toISOString(),
  country_iso3: country, topic: "critical_minerals", capability: "structural_country_digest", amount_usdc: "0.02",
  source_rights_verified: true, original_file_sha256_verified: true,
  reference_year: 2025, previous_reference_year: 2024, current_news_or_risk_score: false,
  canonical_engine_deliverable: true, prepared_customer_bytes_sha256: hash,
  prepared_customer_bytes_length: Buffer.byteLength(customerBytes),
  private_immutable_archive_verified: archived, private_archive_key: key,
  query_plan_hash: plan.query_plan_hash, merchant_acceptance_verified: false,
  payable_offer_issued: false, settlement_attempts: 0, execution_authorized: false };
await mkdir("artifacts", { recursive: true });
await writeFile("artifacts/first-qualified-structural-digest-receipt.json", JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify(receipt));
// No raw original, derived customer bytes or private rights metadata in artifacts/logs.
