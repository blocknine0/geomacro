import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";
import { canonicalJson } from "../../src/lib/canonical-json";
import { buildAgentQueryPlan, agentAdaptiveQuerySchema } from "../../src/lib/agent-query-plan";
import { checkAgentQueryDeliverability } from "../../src/lib/agent-query-deliverability.server";
import { assembleAgentQueryResponse } from "../../src/lib/agent-query-response.server";
import { loadQualifiedMcsCountryContext, loadQualifiedMcsRelease,
  summarizeQualifiedMcs195StructuralCoverage, MCS_DIGEST_SOURCE_ID,
  MCS_DIGEST_CSV_SHA256, qualifiedMcsAcquisitionFailure }
  from "../../src/lib/qualified-mcs-country-digest.server";
import { resolveGeomacroCapabilityPrice } from "../../src/lib/capability-pricing-catalog";
import { country195ByIso3 } from "../../src/lib/canonical-country-registry-195";
import { createB2Client } from "./b2-s3-client.mjs";
import { STRUCTURAL_CANDIDATE_VERSION, STRUCTURAL_CANDIDATE_SCOPE, structuralCandidateHash, assertStructuralCandidate }
  from "../../workers/commerce-ledger/src/structural-candidate.mjs";

const sha = (v: string | Uint8Array) => createHash("sha256").update(v).digest("hex");
const country = process.env.GEOMACRO_FIRST_DIGEST_COUNTRY ?? "CHN";
if (!country195ByIso3(country)) throw Error("FIRST_DIGEST_UNSUPPORTED_COUNTRY");
const persist = process.argv.includes("--archive-private");
const freezePrivate = process.argv.includes("--freeze-private");
// Never load frozen DB/payment credentials or real-money ACKs for this operation.
process.env.GEOMACRO_SUPABASE_RUNTIME_MODE = "standby";
for (const name of ["SUPABASE_DB_URL", "SUPABASE_SERVICE_ROLE_KEY", "APP_SUPABASE_SERVICE_ROLE_KEY",
  "HISTORICAL_SUPABASE_SERVICE_ROLE_KEY", "COINBASE_X402_MAINNET_ACK", "CIRCLE_X402_MAINNET_ACK",
  "GEOMACRO_COMMERCIAL_LAUNCH_ACK"]) {
  if (process.env[name]) throw Error("FIRST_DIGEST_FORBIDDEN_RUNTIME_CONFIG");
}
const context = await loadQualifiedMcsCountryContext(country);
if (!context) throw Error(qualifiedMcsAcquisitionFailure() ?? "FIRST_DIGEST_COMPARABLE_COUNTRY_ROWS_UNAVAILABLE");
const alreadyVerifiedMcs = await loadQualifiedMcsRelease();
if (!alreadyVerifiedMcs) throw Error("FIRST_DIGEST_195_COUNTRY_SOURCE_CENSUS_UNAVAILABLE");
const mcs195SourceCensus = summarizeQualifiedMcs195StructuralCoverage(alreadyVerifiedMcs.rows, new Date());
// Census is measured from SAME SHA and CC0 rights-verified cached original.
// It cannot qualify source eligibility for other countries without the exact
// canonical Store per-country availability + source-rights contract.
if (mcs195SourceCensus.canonical_country_count !== 195 ||
    mcs195SourceCensus.countries_with_comparable_source<1 ||
    !mcs195SourceCensus.country_coverage.some(x=>x.iso3===country &&
      x.status==="COMPARABLE_2024_2025_SOURCE"))
  throw Error("FIRST_DIGEST_CENSUS_WRONG_COUNTRY_OR_NO_SOURCE");

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
// Fixed, 3-country canonical Store evidence sampling from the same verified
// source bytes. No second publisher CSV fetch, wallet/payment, quote, signed
// risk object, buyer entitlement or cloud archive write. Availability may be
// genuinely negative: retain the negative state, never invent a sale.
const additionalCountrySampleIso3s=["AUS","IND","USA"] as const;
const additionalCountrySamples: Array<{
  iso3:string;
  state:"PREPARED_SOURCE_ELIGIBLE_NO_FUNDS"|"ALREADY_SELECTED_COUNTRY_PROVEN"|
    "NO_COMPARABLE_SOURCE"|"CANONICAL_STORE_UNAVAILABLE";
  answer_sha256:string|null;payment_authorized:false;
  signed_risk_object_verified:false;customer_delivery_verified:false;
}> = [];
for(const iso3 of additionalCountrySampleIso3s){
  let state:typeof additionalCountrySamples[number]["state"]="NO_COMPARABLE_SOURCE";
  let answerHash:string|null=null;
  if(iso3===country){
    state="ALREADY_SELECTED_COUNTRY_PROVEN";answerHash=hash;
  } else if(mcs195SourceCensus.country_coverage.some(row=>row.iso3===iso3 &&
      row.status==="COMPARABLE_2024_2025_SOURCE")) {
    try {
      const candidatePlan=buildAgentQueryPlan(agentAdaptiveQuerySchema.parse({
        schema_version:"geomacro.agent-query.v1",
        delivery_tier:"structural_baseline",fulfillment_mode:"published_only",
        subjects:[{type:"country",country_iso3:iso3}],
        topics:["critical_minerals"],detail:"compact",
      }));
      const availabilityForCountry=await checkAgentQueryDeliverability(candidatePlan);
      // Rights are for the exact USGS dataset only. An unrelated available
      // product source cannot qualify as this MCS2026 country acceptance.
      const eligible=availabilityForCountry.deliverable===true&&
        availabilityForCountry.code==="AVAILABLE"&&
        availabilityForCountry.query_plan_hash===candidatePlan.query_plan_hash&&
        availabilityForCountry.source_contracts.length===1&&
        availabilityForCountry.source_contracts[0].source_id===MCS_DIGEST_SOURCE_ID&&
        availabilityForCountry.source_contracts[0].attribution_required===false&&
        availabilityForCountry.ineligible_source_ids.length===0&&
        availabilityForCountry.missing_modules.length===0&&
        availabilityForCountry.stale_modules.length===0;
      if(eligible){
        const payload=await assembleAgentQueryResponse({
          plan:candidatePlan,requestId:"source-qualified-sample:"+candidatePlan.query_plan_hash,
          priceUsdc:price.amount_usdc,
        });
        const bytes=canonicalJson(payload);
        if(!/sciencebase|datacite|usgs_mcs|source_url|source_id|input_row_hashes/iu.test(bytes)&&
          payload.signed_risk_objects.length===0&&payload.gri_context===null&&
          payload.execution_authorized===false) {
          state="PREPARED_SOURCE_ELIGIBLE_NO_FUNDS";
          answerHash=sha(bytes);
        }
      }
      if(!answerHash)state="CANONICAL_STORE_UNAVAILABLE";
    }catch{state="CANONICAL_STORE_UNAVAILABLE";}
  }
  additionalCountrySamples.push({
    iso3,state,answer_sha256:answerHash,payment_authorized:false,
    signed_risk_object_verified:false,customer_delivery_verified:false,
  });
}

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
const native = "2025-12-31T23:59:59.000Z";
const candidate = { schema: STRUCTURAL_CANDIDATE_VERSION, capability: "structural_country_digest",
  variant: "standard", amount_atomic: "20000", country_iso3: country, topic: "critical_minerals",
  request_hash: plan.query_plan_hash, answer_sha256: hash, source_file_sha256: MCS_DIGEST_CSV_SHA256,
  rights_metadata_sha256: (provenance[0] as any).rights_metadata_sha256,
  source_period_end: native, checked_at: checkedAt,
  expires_at: new Date(Math.min(Date.parse(checkedAt) + 86400_000,
    Date.parse(native) + 400 * 86400_000)).toISOString(), binding_hash: "" };
candidate.binding_hash = await structuralCandidateHash(candidate);
// Actual canonical customer bytes, not a fixture, must pass the same storage
// validator even in the secret-free real-source pre-merge acceptance.
await assertStructuralCandidate(candidate, customerBytes, STRUCTURAL_CANDIDATE_SCOPE);
let vaultVerified = false;
let vaultBindingHash: string | null = null;
let vaultExpiry: string | null = null;
if (freezePrivate) {
  const origin = (process.env.GEOMACRO_COMMERCE_LEDGER_URL ?? "").trim().replace(/\/$/u, "");
  const token = (process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN ?? "").trim();
  const u = new URL(origin);
  if (u.protocol !== "https:" || u.username || u.password || u.port || u.search || u.hash ||
      u.pathname !== "/" || !u.hostname.startsWith("geomacro-commerce-ledger.") ||
      !u.hostname.endsWith(".workers.dev") || token.length < 32)
    throw Error("FIRST_DIGEST_PRIVATE_VAULT_CONFIG_REQUIRED");
  const healthRes = await fetch(origin + "/health", { redirect: "manual", signal: AbortSignal.timeout(10_000) });
  const health = await healthRes.json();
  if (!healthRes.ok || health.storage !== "durable_objects_sqlite" ||
      health.structural_candidate_contract_version !== STRUCTURAL_CANDIDATE_VERSION)
    throw Error("FIRST_DIGEST_PRIVATE_VAULT_VERSION_UNVERIFIED");
  async function post(action: string, fields: Record<string, unknown>) {
    const res = await fetch(origin + "/v1/delivery/" + action, { method: "POST", redirect: "manual",
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      body: JSON.stringify({ ...STRUCTURAL_CANDIDATE_SCOPE, ...fields }), signal: AbortSignal.timeout(10_000) });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  }
  const frozen = await post("structural-candidate-freeze", { candidate, customerBytes });
  if (frozen.status !== 200 || frozen.body?.ok !== true ||
      !["FROZEN", "EXACT_REPLAY"].includes(frozen.body?.disposition) ||
      frozen.body?.binding_hash !== candidate.binding_hash)
    throw Error("FIRST_DIGEST_PRIVATE_VAULT_FREEZE_REJECTED");
  for (let i = 0; i < 2; i++) {
    const readback = await post("structural-candidate-readback", { bindingHash: candidate.binding_hash });
    if (readback.status !== 200 || readback.body?.ok !== true ||
        readback.body?.customerBytes !== customerBytes || sha(readback.body.customerBytes) !== hash ||
        canonicalJson(readback.body.candidate) !== canonicalJson(candidate) ||
        readback.body.payment_authorized !== false || readback.body.settlement_attempted !== false)
      throw Error("FIRST_DIGEST_PRIVATE_VAULT_EXACT_READBACK_FAILED");
  }
  const replay = await post("structural-candidate-freeze", { candidate, customerBytes });
  if (replay.status !== 200 || replay.body?.disposition !== "EXACT_REPLAY")
    throw Error("FIRST_DIGEST_PRIVATE_VAULT_REPLAY_FAILED");
  const corrupt = await post("structural-candidate-freeze", { candidate, customerBytes: customerBytes + " " });
  if (corrupt.status !== 409 || corrupt.body?.ok === true)
    throw Error("FIRST_DIGEST_PRIVATE_VAULT_CORRUPT_BYTES_ACCEPTED");
  vaultVerified = true; vaultBindingHash = candidate.binding_hash; vaultExpiry = candidate.expires_at;
}
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
  mcs_195_source_census: mcs195SourceCensus,
  mcs_canonical_store_no_funds_country_samples: additionalCountrySamples,
  mcs_canonical_store_source_sample_count: additionalCountrySamples.filter(s=>
    s.state==="PREPARED_SOURCE_ELIGIBLE_NO_FUNDS"||
    s.state==="ALREADY_SELECTED_COUNTRY_PROVEN").length,
  reference_year: 2025, previous_reference_year: 2024, current_news_or_risk_score: false,
  canonical_engine_deliverable: true, prepared_customer_bytes_sha256: hash,
  prepared_customer_bytes_length: Buffer.byteLength(customerBytes),
  private_vault_admission_validated: true,
  private_immutable_archive_verified: archived, private_archive_key: key,
  private_immutable_delivery_bytes_verified: archived || vaultVerified,
  private_candidate_vault_verified: vaultVerified, vault_binding_hash: vaultBindingHash,
  vault_expires_at: vaultExpiry,
  query_plan_hash: plan.query_plan_hash, merchant_acceptance_verified: false,
  payable_offer_issued: false, settlement_attempts: 0, execution_authorized: false };
await mkdir("artifacts", { recursive: true });
await writeFile("artifacts/first-qualified-structural-digest-receipt.json", JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify(receipt));
// No raw original, derived customer bytes or private rights metadata in artifacts/logs.
