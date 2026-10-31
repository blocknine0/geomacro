import {resolveEligiblePublishedCapabilityPrice} from "./verified-capability-coinbase-binding.server";
import {selectedCheckoutNetwork} from "./x402-checkout-network-selection";
import {explicitlyConfiguredNoCardCheckout,isNoCardSignedPayload,
  handleNoCardAdaptiveCheckout} from "./no-card-x402-adaptive-route.server";
import { randomUUID } from "node:crypto";
import {makeGeomacroNoChargeResponse} from "./geomacro-nocharge";
import {
  qualifyRetrievedOnDemandEvidence, publicOnDemandQualificationStatus,
  buildPrivateVerifiedFedMinutesFinding,
  type QualifiedPrivateEvidence,
} from "./on-demand-evidence-qualification.server";
import { ZodError } from "zod";
import { AGENT_QUERY_TOPICS, agentAdaptiveQuerySchema, buildAgentQueryPlan } from "./agent-query-plan";
import {bindPrivateFedMinutesToExactCustomerQuery}
  from "./on-demand-private-query-bound-draft.server";
import {GEOMACRO_STRUCTURED_LICENSE_DISCOVERY,
  GEOMACRO_STRUCTURED_LICENSE_HEADERS}
  from "./geomacro-structured-commercial-license";
import { buildPrivateOnDemandMacroDrivers } from "./on-demand-private-macro-drivers.server";
import { scorePrivateOnDemandMacroPeers, type PrivatePeerMacroResult } from "./on-demand-private-macro-peer-score.server";
import {
  checkPrivateOnDemandMacroRights,
  type PrivateOnDemandMacroRightsStatus,
} from "./on-demand-private-macro-rights.server";
import { checkAgentQueryDeliverability, publicAgentQueryAvailability } from "./agent-query-deliverability.server";
import { checkAgentQueryExternalModule } from "./agent-query-external-modules.server";
import {prepareVerifiedCapabilityOffer,assertFrozenCapabilityResponse,assertFrozenCapabilityCurrentForSettlement} from "./capability-x402-offer.server";
import {readVerifiedCapabilityAnswer} from "./capability-x402-prequote.server";
import {readAlreadyDeliveredCapabilityReplay} from "./capability-x402-replay.server";
import {assertAcceptedCapabilityQuote,assertCapabilityPaymentBinding,
  capabilityQuoteFromPaymentPayload,capabilityLedgerRequestFingerprint,
  coinbaseRequirementsForCapabilityQuote} from "./capability-x402-payment-contract.server";
import type {PreparedCapabilityQuote as CapabilityQuote} from "./capability-prepared-quote.server";
import {freezeCanonicalCapabilityHttpBody,sendFrozenCapabilityHttpBody,
  type FrozenCapabilityHttpBody} from "./capability-x402-exact-http-body.server";
import { resolveEligibleCoinbaseCapabilityConfig } from "./verified-capability-coinbase-binding.server";
import {
  assertCoinbasePaymentBinding,
  bazaarExtensionOutcome,
  claimCoinbaseX402Delivery,
  coinbasePaymentFingerprint,
  coinbaseRequestFingerprint,
  coinbaseX402PaymentResponseHeader,
  completeCoinbaseX402Delivery,
  decodeCoinbasePaymentHeader,
  encodeX402Header,
  getCoinbaseX402Config,
  paymentPayloadEchoesBazaar,
  persistCoinbaseSettlementTelemetry,
  prepareCoinbaseX402Delivery,
  releaseCoinbaseX402DeliveryForRetry,
  settleCoinbaseX402,
  verifyCoinbaseX402,
  type CoinbaseSettleResult,
  type CoinbaseX402Config,
} from "./coinbase-x402.server";
import {
  finalizeCoinbaseX402AgentUsage,
  releaseCoinbaseX402AgentUsage,
  reserveCoinbaseX402AgentUsage,
} from "./coinbase-x402-usage-guard.server";
import { upsertCoinbaseX402ProductAudit } from "./coinbase-x402-product-audit.server";
import { allowPublicDemoRequest } from "./public-demo-rate-limit.server";
import {publicQueryResolution} from "./universal-query-resolution";
import { lookupTelegramFallback } from "./on-demand-telegram-fallback.server";
import { readD1VerifiedHotCountryGro } from "./d1-country-gro-hot.server";
import {readAllAutoIngest72hStructuredDrafts} from "./auto-ingest-72h-context.server";
import {
  categoriesForOnDemandTopics, discoverOnDemandForPrivateQualification, inferOnDemandMineral,
  inferOnDemandFreshnessSeconds, requestsHistoricalMineralData,
  verifyOnDemandOriginalArticlePages, type OnDemandCategory, type SourceProbe,
} from "./on-demand-global-discovery.server";
import { buildSourceGroundedResearchAnswer, buildStructuredEvidenceGap,
  type SourceGroundedResearchAnswer } from "./on-demand-research-answer.server";
import type { BgsMineralHistory } from "./bgs-world-mineral-statistics.server";
import {fetchOfficialMineralStatisticalObservations} from "./mineral-statistical-official.server";

const MAX_BODY_BYTES = 32 * 1024;
const PRODUCT_ID = "geomacro_adaptive_risk_intelligence_v1";
export const CANONICAL_MAINNET_INTELLIGENCE_PATH = "/api/v1/intelligence/query" as const;
export const LEGACY_X402_INTELLIGENCE_PATH = "/api/x402/intelligence" as const;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, PAYMENT-SIGNATURE, payment-signature",
  "Access-Control-Expose-Headers": "PAYMENT-REQUIRED, PAYMENT-RESPONSE, X-Geomacro-Delivery-SHA256, X-Geomacro-Quote-ID, X-Geomacro-Output-License, X-Geomacro-Raw-Data-Delivered, Link",
  "Access-Control-Max-Age": "600",
};

function json(payload: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return Response.json(payload, {
    status,
    headers: {
      ...corsHeaders,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

async function parseJsonBody(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Response("Content-Type must be application/json", { status: 415 });
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new Response("Request body too large", { status: 413 });
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw new Response("Request body too large", { status: 413 });
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Response("Request body is not valid JSON", { status: 400 });
  }
}

function adaptiveBazaarExtension(planHash: string) {
  return {
    bazaar: {
      info: {
        input: {
          type: "http",
          method: "POST",
          bodyType: "json",
          body: {
            question: "What are the current macro, FX and geopolitical risks for India?",
            subjects: [{ type: "country", country_iso3: "IND" }],
            topics: ["macro_risk", "fx_external_risk", "conflict_geopolitics"],
            max_age_seconds: 86400,
            detail: "standard",
          },
        },
        output: {
          type: "json",
          example: {
            schema_version: "geomacro.adaptive-intelligence-response.v1",
            product: PRODUCT_ID,
            query_plan_hash: planHash,
            delivery_boundary: "STRUCTURED_DERIVED_INTELLIGENCE_ONLY",
            raw_data_delivered: false,
            source_identity_delivered: false,
            execution_authorized: false,
          },
        },
      },
      schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          input: { type: "object" },
          output: { type: "object" },
        },
        required: ["input"],
      },
    },
    geomacro: {
      info: {
        product: PRODUCT_ID,
        query_plan_hash: planHash,
        delivery_boundary: "STRUCTURED_DERIVED_INTELLIGENCE_ONLY",
        raw_data_delivered: false,
        source_identity_delivered: false,
        execution_authorized: false,
        structured_output_license_id:GEOMACRO_STRUCTURED_LICENSE_DISCOVERY.id,
        structured_output_license_path:GEOMACRO_STRUCTURED_LICENSE_DISCOVERY.human_readable,
        license_disclosure_is_not_payment_authorization:true,
      },
      schema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          product: { type: "string" },
          query_plan_hash: { type: "string" },
          delivery_boundary: { type: "string", const: "STRUCTURED_DERIVED_INTELLIGENCE_ONLY" },
          raw_data_delivered: { type: "boolean", const: false },
          source_identity_delivered: { type: "boolean", const: false },
          execution_authorized: { type: "boolean", const: false },
        },
        required: ["product", "query_plan_hash", "delivery_boundary", "raw_data_delivered", "source_identity_delivered", "execution_authorized"],
      },
    },
  };
}

function adaptivePaymentRequired(request: Request, config: CoinbaseX402Config, planHash: string, quote:CapabilityQuote) {
  const source=adaptiveBazaarExtension(planHash);
  const resourceUrl = new URL(CANONICAL_MAINNET_INTELLIGENCE_PATH, request.url).toString();
  return {
    x402Version: 2,
    resource: {
      url: resourceUrl,
      description:
        "Question-adaptive Geomacro structured derived risk intelligence for autonomous agents. No raw source feed or source identity is sold or returned. Payment is offered only after no-charge deliverability validation.",
      mimeType: "application/json",
      serviceName: "Geomacro",
      tags: ["geopolitical-risk", "macro-risk", "critical-minerals", "country-risk", "hot-topics", "risk-gate", "ai-agents"],
    },
    accepts: [coinbaseRequirementsForCapabilityQuote(config,quote)],
    extensions: {...source,geomacro:{...source.geomacro,
      info:{...source.geomacro.info,capability_quote:quote}}},
  };
}

function assertAdaptiveQueryBinding(paymentPayload: Record<string, unknown>, planHash: string) {
  const extensions = paymentPayload.extensions;
  if (!extensions || typeof extensions !== "object" || Array.isArray(extensions)) {
    throw new Error("PAYMENT_QUERY_BINDING_EXTENSION_MISSING");
  }
  const geomacro = (extensions as Record<string, unknown>).geomacro;
  if (!geomacro || typeof geomacro !== "object" || Array.isArray(geomacro)) {
    throw new Error("PAYMENT_QUERY_BINDING_EXTENSION_MISSING");
  }
  const extension = geomacro as Record<string, unknown>;
  const info = extension.info;
  if (!info || typeof info !== "object" || Array.isArray(info)) {
    throw new Error("PAYMENT_QUERY_BINDING_EXTENSION_MISSING");
  }
  const binding = info as Record<string, unknown>;
  if (binding.product !== PRODUCT_ID || binding.query_plan_hash !== planHash) {
    throw new Error("PAYMENT_QUERY_PLAN_MISMATCH");
  }
}

function paymentRequiredResponse(request: Request, config: CoinbaseX402Config, planHash: string, quote:CapabilityQuote) {
  const required = adaptivePaymentRequired(request, config, planHash,quote);
  return json(required, 402, { ...GEOMACRO_STRUCTURED_LICENSE_HEADERS, "PAYMENT-REQUIRED": encodeX402Header(required) });
}

/** Do not retroactively label legacy paid ledger replays with a new licence.
 * New prepared responses bind the actual disclosed version to durable payment
 * metadata, outside the signed Geomacro intelligence/product hash.
 */
function licensedPaidDeliveryHeaders(prepared: Record<string, unknown>) {
  const payment=prepared.payment;
  if(!payment||typeof payment!=="object"||Array.isArray(payment)||
     (payment as Record<string,unknown>).output_contract_version !==
       GEOMACRO_STRUCTURED_LICENSE_DISCOVERY.id)
    return {};
  return GEOMACRO_STRUCTURED_LICENSE_HEADERS;
}

type PublicSourceHealthState =
  | "LEADS_OBSERVED"
  | "NO_LEADS_IN_BOUNDED_SEARCH"
  | "PARTIAL_SOURCE_OUTAGE"
  | "SOURCE_OUTAGE"
  | "ACCESS_RESTRICTED"
  | "NOT_ATTEMPTED_WITHIN_BUDGET";

/** Aggregate only: never expose publisher families, URLs, titles or private evidence. */
export function publicOnDemandSourceHealth(
  probes: readonly SourceProbe[],
  categories: readonly OnDemandCategory[],
) {
  return Object.fromEntries(categories.map(category => {
    const rows=probes.filter(probe=>probe.category===category);
    const count=(state:NonNullable<SourceProbe["retrieval_state"]>)=>
      rows.filter(probe=>probe.retrieval_state===state).length;
    const attempted=rows.filter(probe=>probe.attempted).length;
    const reachable=rows.filter(probe=>probe.reachable).length;
    const leads=rows.reduce((total,probe)=>total+Math.max(0,probe.observed_record_count),0);
    const rateLimited=count("RATE_LIMITED");
    const accessRestricted=count("ACCESS_RESTRICTED");
    const transportUnavailable=count("TRANSPORT_UNAVAILABLE");
    const cooldownActive=count("COOLDOWN_ACTIVE");
    const providerInvalid=count("PROVIDER_INVALID");
    const failed=rateLimited+accessRestricted+transportUnavailable+cooldownActive+providerInvalid;
    const state:PublicSourceHealthState=leads>0 ? "LEADS_OBSERVED"
      : attempted===0 ? "NOT_ATTEMPTED_WITHIN_BUDGET"
      : reachable>0 && failed>0 ? "PARTIAL_SOURCE_OUTAGE"
      : reachable>0 ? "NO_LEADS_IN_BOUNDED_SEARCH"
      : accessRestricted>0 && failed===accessRestricted ? "ACCESS_RESTRICTED"
      : "SOURCE_OUTAGE";
    return [category,{
      state,
      search_scope:"BOUNDED_APPROVED_SOURCE_MESH",
      exhaustive:false,
      source_checks_attempted:attempted,
      source_checks_reachable:reachable,
      leads_observed:leads,
      rate_limited:rateLimited,
      access_restricted:accessRestricted,
      transport_unavailable:transportUnavailable,
      cooldown_active:cooldownActive,
      provider_invalid:providerInvalid,
      retryable:rateLimited+transportUnavailable+cooldownActive>0,
      automatic_retry:false,
    }];
  }));
}

function replaySettlement(tx: string | null, network: string | null): CoinbaseSettleResult {
  return { success: true, transaction: tx ?? undefined, network: network ?? undefined, extra: { idempotentReplay: true } };
}

export const mainnetIntelligenceHandlers = {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
      GET: async ({ request }: { request: Request }) => {
        // Discovery is a zero-charge, read-only capability. It must remain
        // machine-readable if Coinbase is absent, intentionally frozen or
        // incompletely configured. Only POST may quote, verify or settle.
        // Never leak operator config/secret validation details to callers.
        let config: CoinbaseX402Config | null = null;
        try { config = getCoinbaseX402Config(); }
        catch { /* A locked/broken rail is unavailable, not an API catalog failure. */ }
        return json({
          ok: true,
          service: "Geomacro Adaptive Risk Intelligence",
          product: PRODUCT_ID,
          endpoint: new URL(CANONICAL_MAINNET_INTELLIGENCE_PATH, request.url).toString(),
          legacy_compatibility_endpoint: new URL(LEGACY_X402_INTELLIGENCE_PATH, request.url).toString(),
          availability_endpoint: new URL("/api/x402/risk/availability", request.url).toString(),
          x402_version: 2,
          configured: config !== null,
          // This is payment-rail configuration only, NOT proof that fresh
          // rights-qualified signed intelligence is commercially deliverable.
          payment_rail_status: config === null
            ? "CONTROLLED_PRELAUNCH_UNAVAILABLE"
            : "CONFIGURED_DELIVERY_STILL_REQUIRES_LIVE_PROOF",
          environment: config?.environment ?? "prelaunch",
          network: config?.network ?? null,
          asset: "USDC",
          // One global flat price is not a valid capability quote.
          // Buyers must POST a proven plan for an exact server-derived amount.
          exact_price_usdc: null,
          pricing_policy: "SERVER_VERIFIED_CAPABILITY_AND_VARIANT",
          topics: AGENT_QUERY_TOPICS,
          coverage: "data-driven; only currently deliverable subjects are payable",
          live_on_demand_discovery_supported: true,
          live_on_demand_payment_authorized: false,
          discovery_is_free: true,
          discovery_proves_current_product: false,
          no_funds_or_payment_claimed: true,
          machine_next_steps: {
            schemas: "/api/v1/agent?view=openapi",
            exact_prices: "/api/v1/pricing",
            baseline_only_availability: "/api/v1/intelligence/availability",
            payable_request: CANONICAL_MAINNET_INTELLIGENCE_PATH,
            retry_paid_request_automatically: false,
          },
          delivery_boundary: "STRUCTURED_DERIVED_INTELLIGENCE_ONLY",
          raw_data_delivered: false,
          source_identity_delivered: false,
          execution_authorized: false,
        });
      },
      POST: async ({ request }: { request: Request }) => {
        let explicitlySelectedNetwork:"base"|"polygon"|null;
        try{explicitlySelectedNetwork=selectedCheckoutNetwork(request);}
        catch{return json({ok:false,chargeable:false,payment_required_now:false,
          error:{code:"MAINNET_NETWORK_QUERY_UNSUPPORTED"},execution_authorized:false},400);}
        let raw: unknown;
        try { raw = await parseJsonBody(request); } catch (error) {
          if (error instanceof Response) return json({ ok: false, error: { code: "INVALID_AGENT_REQUEST", message: await error.text() }, execution_authorized: false }, error.status);
          throw error;
        }

        if (!allowPublicDemoRequest(request, { namespace: "coinbase-x402-adaptive", windowMs: 60_000, maxPerClient: 20, maxGlobal: 200 })) {
          return json({ ok: false, error: { code: "X402_RATE_LIMITED", message: "Adaptive intelligence request limit exceeded." }, execution_authorized: false }, 429);
        }

        let parsed: ReturnType<typeof agentAdaptiveQuerySchema.parse>;
        let plan: ReturnType<typeof buildAgentQueryPlan>;
        try {
          parsed = agentAdaptiveQuerySchema.parse(raw);
          plan = buildAgentQueryPlan(parsed);
        } catch (error) {
          if (error instanceof ZodError) {
            return json({ ok: false, chargeable: false, error: { code: "INVALID_ADAPTIVE_QUERY", issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) }, execution_authorized: false }, 400);
          }
          return json({ ok: false, chargeable: false, error: { code: "UNSUPPORTED_ADAPTIVE_QUERY", message: error instanceof Error ? error.message : "Query cannot be safely planned." },
            resolution:publicQueryResolution(raw,error),execution_authorized: false }, 400);
        }

        // Request-time global retrieval is separate from GRO publication and
        // cannot claim commercial-ready status from a search-index hit.
        // Discovery itself is B2/Supabase-free; a rights-bearing macro result
        // may perform one cached, fail-closed read of the governed B2 rights
        // snapshot. No writes or funds are involved.
        if (plan.fulfillment_mode === "live_on_demand") {
          // This discovery product has provider fanout and therefore a far
          // smaller free-tier budget than ordinary stored-state API reads.
          if (!allowPublicDemoRequest(request,{
            namespace:"geomacro-live-on-demand-discovery",
            windowMs:60_000,maxPerClient:2,maxGlobal:12,
          })) {
            return json({
              ok:false,chargeable:false,payment_required_now:false,
              error:{code:"ON_DEMAND_PROVIDER_BUDGET_RATE_LIMITED"},
              execution_authorized:false,
            },429);
          }
          const subject = plan.subjects[0];
          if (plan.subjects.length !== 1 || subject.type !== "country" ||
              plan.as_of !== null ||
              plan.topics.some(t => ["risk_object","risk_gate","gri_context"].includes(t))) {
            return json({
              ok:false,chargeable:false,payment_required_now:false,
              error:{code:"ON_DEMAND_QUERY_SCOPE_UNSUPPORTED"},
              execution_authorized:false,
            },422);
          }
          // One canonical topic registry selects all applicable source lanes;
          // cross-cutting trade topics intentionally reach both geo and macro.
          const categories:OnDemandCategory[]=categoriesForOnDemandTopics(plan.topics);
          if (categories.length === 0) {
            return json({
              ok:false,chargeable:false,payment_required_now:false,
              error:{code:"ON_DEMAND_CATEGORY_NOT_SUPPORTED"},
              execution_authorized:false,
            },422);
          }
          // Reuse the exact same 72h D1 auto-ingest stream as private
          // STRUCTURED RESEARCH DRAFTS for this country/category query.
          // A publisher-title country mention is just a lead, not verified
          // article relevance, corroboration, commercial reuse or payment.
          // Never copy drafts into paid evidence or the public 422 payload.
          const autoIngestDrafts=await readAllAutoIngest72hStructuredDrafts(
            subject.country_iso3,categories);
          const autoIngestCandidateTopicCount=new Set(
            autoIngestDrafts.map(d=>d.topic)).size;
          // Query-specific commodity routing uses only fixed identifiers.
          // Ambiguous multi-mineral requests require a scoped query instead of
          // returning unrelated articles as intelligence for one commodity.
          let mineral;
          let mineralScopeAmbiguous=false;
          try {
            mineral=categories.includes("rare_earth")
              ? inferOnDemandMineral(plan.question_key) : null;
          } catch {
            // Keep the valid question in the same structured-response contract.
            // Without a multi-mineral source adapter, return a scoped gap rather
            // than silently choosing one commodity or emitting an unfiltered hit.
            mineral=null;
            mineralScopeAmbiguous=true;
          }
          let requestedNewsAgeSeconds:number|undefined;
          try {
            requestedNewsAgeSeconds=plan.requested_max_age_seconds ??
              inferOnDemandFreshnessSeconds(plan.question_key) ?? undefined;
          } catch {
            return json({
              ok:false,chargeable:false,payment_required_now:false,
              error:{code:"ON_DEMAND_FRESHNESS_SCOPE_UNSUPPORTED"},
              execution_authorized:false,
            },422);
          }
          // Read the existing independently signature-verified D1 country GRO
          // first; an outage/empty object is not a reason to contact Supabase.
          // Country GRO availability is only a hint, NOT proof that the exact
          // requested topic/mineral is answered. Never bypass the x402 gate.
          let existingVerifiedCountryGroAvailable=false;
          try {
            existingVerifiedCountryGroAvailable=Boolean(
              await readD1VerifiedHotCountryGro(subject.country_iso3,new Date().toISOString()));
          } catch { /* Storage lookup is optional, live retrieval continues. */ }
          let discovery;
          let privatelyQualifiedOriginalCandidateCount=0;
          let privateOriginalReviewCandidateCount=0;
          let duplicatePrivateOriginalHeadlines=0;
          let articlePageChecks=0;
          let articleDatesVerified=0;
          let privateFedSourceBoundFindingCandidateCount=0;
          let privateExactQueryBoundFedDraftCount=0;
          let privateOfficialAnnualChanges=0;
          let privateAnnualDirectionalDrivers=0;
          let privateAnnualRightsVerifiedDrivers=0;
          let privateAnnualMacroRightsStatus:PrivateOnDemandMacroRightsStatus="NO_ANNUAL_EVIDENCE";
          let privatePeerMacroStatus:PrivatePeerMacroResult["status"]="NO_CERTIFIED_MACRO_RIGHTS";
          let privatePeerScoredDimensions=0;
          let privateEvidenceQualification:ReturnType<typeof publicOnDemandQualificationStatus>|null=null;
          let sourceGroundedResearchAnswer:SourceGroundedResearchAnswer|null=null;
          let historicalMineralAnswer:BgsMineralHistory|null=null;
          try {
            const privateResult=await discoverOnDemandForPrivateQualification({
              country_iso3:subject.country_iso3,categories,mineral,
              topics:plan.topics,
              max_age_seconds:requestedNewsAgeSeconds,
              include_historical_mineral_data:categories.length===1 &&
                categories[0]==="rare_earth" && Boolean(mineral) &&
                !mineralScopeAmbiguous&&requestsHistoricalMineralData(plan.question_key),
            });
            discovery=privateResult.discovery;
            historicalMineralAnswer=privateResult.private_mineral_history;
            // NEVER copy privateResult.private_candidates into the public
            // response/ledger/x402 quote; article-page publication, rights
            // and independent same-event verification are not yet complete.
            privatelyQualifiedOriginalCandidateCount=privateResult.private_candidates.length;
            privateOriginalReviewCandidateCount=privateResult.private_original_review_candidates.length;
            duplicatePrivateOriginalHeadlines=privateResult.duplicate_original_headline_count;
            // Annual official change is useful structural evidence, NOT current
            // news, source rights, an issued risk score, or paid intelligence.
            privateOfficialAnnualChanges=privateResult.private_macro_changes.length;
            const privateDrivers=buildPrivateOnDemandMacroDrivers(
              privateResult.private_macro_changes);
            privateAnnualDirectionalDrivers=privateDrivers.length;
            // The shared certified-source policy is consulted only for
            // actual validated annual evidence, using the existing private
            // B2 rights snapshot. Unavailable/expired rights fail closed.
            const rightsProof=await checkPrivateOnDemandMacroRights(privateDrivers);
            privateAnnualRightsVerifiedDrivers=rightsProof.rights_verified_driver_count;
            privateAnnualMacroRightsStatus=rightsProof.status;
            // Reuse existing versioned pilot normalization only if derived
            // rights are certified. Official peer registry + at most two
            // same-year indicators: three extra bounded read-only calls.
            // The partial component stays private; never quote x402 or
            // present an unsigned score as a customer product.
            const privatePeerProof=await scorePrivateOnDemandMacroPeers(
              privateResult.private_macro_changes, rightsProof);
            privatePeerMacroStatus=privatePeerProof.status;
            privatePeerScoredDimensions=privatePeerProof.peer_normalized_dimension_count;
            const pageProof=await verifyOnDemandOriginalArticlePages(
              privateResult.private_original_review_candidates,
              {maxAgeSeconds:requestedNewsAgeSeconds});
            sourceGroundedResearchAnswer=mineralScopeAmbiguous?null:buildSourceGroundedResearchAnswer({
              country_iso3:subject.country_iso3,categories,topics:plan.topics,
              max_age_seconds:requestedNewsAgeSeconds,
              query_plan_hash:plan.query_plan_hash,pageProof,question:plan.question_key,
              now:new Date(privateResult.discovery.checked_at),
            });
            // No page HTML, original URL, title or publisher identity is
            // serialized. This is only publication-clock consistency, NOT
            // independent facts, commercial source rights or signed risk.
            articlePageChecks=pageProof.attempted;
            articleDatesVerified=pageProof.verified;
            // Feed/page-backed original records and official annual structural
            // observations now enter ONE deterministic private qualification
            // contract, without signing, scoring or requesting x402 funds.
            // This remains separate from reviewer-signed same-event admission.
            const qualification:QualifiedPrivateEvidence=qualifyRetrievedOnDemandEvidence({
              search:{
                country_iso3:subject.country_iso3,categories,mineral,
                topics:plan.topics,
                max_age_seconds:requestedNewsAgeSeconds===undefined?undefined:
                  Math.min(requestedNewsAgeSeconds,31*86_400),
              },
              discovery:privateResult.discovery,
              originals:privateResult.private_original_review_candidates,
              verifiedCountryName:privateResult.private_verified_country_name,
              pageProof,macroChanges:privateResult.private_macro_changes,
              macroRights:rightsProof,
              now:new Date(privateResult.discovery.checked_at),
            });
            // Existing query engine, request-local only. No private source
            // references, event prose or hashes enter the public 422 body.
            const privateFedFinding=buildPrivateVerifiedFedMinutesFinding(
              qualification,pageProof,{
                queryPlanHash:plan.query_plan_hash,
                observedAt:new Date(privateResult.discovery.checked_at),
              });
            privateFedSourceBoundFindingCandidateCount=privateFedFinding?1:0;
            if(privateFedFinding){
              const queryBound=bindPrivateFedMinutesToExactCustomerQuery({
                receivedRequest:raw,canonicalPlan:plan,finding:privateFedFinding,
              });
              privateExactQueryBoundFedDraftCount=queryBound.ok?1:0;
              // The unsigned private JSON and article SHA NEVER leave memory.
              // A matching question is NOT rights, reviewer or payment admission.
            }
            privateEvidenceQualification=publicOnDemandQualificationStatus(qualification);
          } catch(error) {
            console.error("[x402-live] bounded discovery failed",error);
            return json({
              ok:false,chargeable:false,payment_required_now:false,
              error:{code:"ON_DEMAND_SEARCH_UNAVAILABLE"},
              execution_authorized:false,
            },503);
          }
          // A missing first-party original triggers at most one governed,
          // per-request read-only research lookup. Telegram returns UNVERIFIED
          // counts only; no reader status makes an x402 product chargeable.
          const telegramFallback = await lookupTelegramFallback({
            country_iso3: subject.country_iso3,
            categories,
            // A feed candidate, article-page timestamp or annual data is NOT
            // qualified same-event corroboration, rights or signed intelligence.
            // Until the independent qualified product is actually available,
            // this request has a genuine intelligence evidence gap.
            originalArticleEvidenceSufficient: false,
          });
          // Official annual country/commodity observations are a completely
          // separate research fallback, not new news, D1 attribution or paid
          // settlement permission. At most five pinned first-party GETs.
          const mineralBaselineObservations=
            !sourceGroundedResearchAnswer&&!historicalMineralAnswer&&
            !mineralScopeAmbiguous&&mineral&&categories.length===1&&
            categories[0]==="rare_earth"
              ?await fetchOfficialMineralStatisticalObservations({
                country_iso3:subject.country_iso3,mineral})
              :[];
          const structuredAnswer=sourceGroundedResearchAnswer?{
            schema:"geomacro.structured-answer.v1" as const,
            status:"RESEARCH_ONLY_WITH_ORIGINAL_DATED_OBSERVATIONS" as const,
            query_plan_hash:plan.query_plan_hash,
            query_scope:sourceGroundedResearchAnswer.query_scope,
            answer:sourceGroundedResearchAnswer.answer,
            evidence_summary:sourceGroundedResearchAnswer.evidence_summary,
            gaps:[...sourceGroundedResearchAnswer.limitations],
            delivery:{chargeable:false,payment_required_now:false,payment_authorized:false,
              signed:false,raw_upstream_delivered:false,execution_authorized:false},
          }:historicalMineralAnswer?{
            schema:"geomacro.structured-answer.v1" as const,
            status:"HISTORICAL_SERIES_ONLY" as const,
            query_plan_hash:plan.query_plan_hash,
            query_scope:{country_iso3:subject.country_iso3,categories,requested_topics:plan.topics,
              query_type:"HISTORICAL_MINERAL_PRODUCTION_SERIES"},
            answer:historicalMineralAnswer,
            evidence_summary:{verified_observation_count:historicalMineralAnswer.series.length,
              first_year:historicalMineralAnswer.observation_period.first_year,
              latest_year:historicalMineralAnswer.observation_period.latest_year,
              current_data:false},
            gaps:[...historicalMineralAnswer.limitations],
            delivery:{chargeable:false,payment_required_now:false,payment_authorized:false,
              signed:false,raw_upstream_delivered:false,source_identity_exposed:true,
              execution_authorized:false},
          }:buildStructuredEvidenceGap({
            country_iso3:subject.country_iso3,categories,topics:plan.topics,
            question:plan.question_key,query_plan_hash:plan.query_plan_hash,
            checked_at:discovery.checked_at,
            source_families_reached:discovery.reached_source_families,
            ...(mineralBaselineObservations.length&&mineral?
              {mineral_commodity:mineral==="rare earth"?"rare_earths":mineral,
               mineral_statistical_observations:mineralBaselineObservations}:{}),
            ...(mineralScopeAmbiguous?{gap_reason:"MULTIPLE_MINERALS_REQUIRE_SEPARATE_SCOPED_QUERY" as const}:{}),
          });
          // No raw upstream records, publisher IDs or original links cross
          // this boundary. No x402 payment quote is issued for discoveries.
          return json({
            ok:false,chargeable:false,payment_required_now:false,
            product:PRODUCT_ID,query_plan_hash:plan.query_plan_hash,
            structured_answer:structuredAnswer,
            ...(sourceGroundedResearchAnswer ? {research_answer:sourceGroundedResearchAnswer} : {}),
            ...(historicalMineralAnswer ? {historical_mineral_answer:historicalMineralAnswer} : {}),
            on_demand:{
              status:discovery.status,
              searched_in_parallel:discovery.searched_in_parallel,
              categories:discovery.categories,
              country_iso3:discovery.country_iso3,
              checked_at:discovery.checked_at,
              network_attempts:discovery.network_attempts,
              reached_source_families:discovery.reached_source_families,
              existing_verified_country_gro_available:existingVerifiedCountryGroAvailable,
              discovered_record_count:discovery.source_probes.reduce((n,p)=>n+p.observed_record_count,0),
              source_health_by_category:publicOnDemandSourceHealth(discovery.source_probes,categories),
              // Own-derived news guides this query's structured research,
              // but only separately verified originals can produce a paid
              // score, quote or settled customer delivery.
              auto_ingest_72h_research_draft_count:autoIngestDrafts.length,
              auto_ingest_72h_distinct_research_topics:autoIngestCandidateTopicCount,
              auto_ingest_72h_drafts_commercially_eligible:false,
              private_original_candidate_count:privatelyQualifiedOriginalCandidateCount,
              duplicate_original_headlines_suppressed:duplicatePrivateOriginalHeadlines,
              private_official_annual_change_count:privateOfficialAnnualChanges,
              historical_mineral_series_count:historicalMineralAnswer?.series.length??0,
              private_annual_directional_macro_driver_count:privateAnnualDirectionalDrivers,
              private_annual_macro_rights_status:privateAnnualMacroRightsStatus,
              private_annual_macro_rights_verified_driver_count:privateAnnualRightsVerifiedDrivers,
              private_macro_peer_score_status:privatePeerMacroStatus,
              private_macro_peer_scored_dimension_count:privatePeerScoredDimensions,
              original_article_page_checks:articlePageChecks,
              article_page_publication_dates_verified:articleDatesVerified,
              private_source_bound_structured_finding_candidates:privateFedSourceBoundFindingCandidateCount,
              private_exact_query_bound_fed_drafts:privateExactQueryBoundFedDraftCount,
              structured_candidate_commercially_admitted:false,
              private_evidence_qualification:privateEvidenceQualification,
              private_originals_article_page_verified:
                privateOriginalReviewCandidateCount>0 &&
                articleDatesVerified===privateOriginalReviewCandidateCount,
              // A missing *verified* current event is scoped to this
              // bounded on-demand search, not an assertion that no real
              // event occurred anywhere. Index hits cannot promote it.
              verified_signed_current_event_count:0,
              current_evidence_state:articleDatesVerified>0
                ?"ORIGINAL_PAGE_DATED_BUT_UNQUALIFIED"
                :"NO_VERIFIED_CURRENT_EVENT_IN_BOUNDED_SEARCH",
              searched_country_category_cells:categories.length,
              bounded_search_exhaustive:false,
              missing_proof_dimensions:[
                "INDEPENDENT_SAME_EVENT",
                "ITEM_COMMERCIAL_RIGHTS",
                "CURRENT_SIGNED_CUSTOMER_READBACK",
              ],
              independent_same_event_corroboration_verified:false,
              source_derived_commercial_rights_verified:false,
              signed_derived_intelligence_created:false,
              telegram_fallback:telegramFallback,
              raw_upstream_delivered:false,
            },
            error:{
              code:"ON_DEMAND_VERIFICATION_PENDING",
              message:"Live search ran, but independent corroboration, commercial rights and signed derived intelligence are not yet proven. No payment is offered.",
            },
            execution_authorized:false,
          },422);
        }

        // A separately approved low-fee x402 checkout is strictly opt-in.
        // Existing Coinbase-signed payments ALWAYS retain their own route and
        // settlement history. Already-settled no-card signatures can replay
        // immutable delivery even if new low-fee sales are subsequently frozen.
        const existingPaymentSignature=request.headers.get("payment-signature");
        const noCardProof=isNoCardSignedPayload(existingPaymentSignature);
        // Explicit buyer-selected Base/Polygon must never fall through to
        // Coinbase's default Base quote if that network's no-card rail is
        // disabled. Existing Coinbase payments without a network selector
        // retain their original byte-exact payment and replay path.
        if(explicitlySelectedNetwork!==null && existingPaymentSignature && !noCardProof)
          return json({ok:false,chargeable:false,payment_required_now:false,
            error:{code:"MAINNET_SELECTED_NETWORK_PAYMENT_RAIL_MISMATCH"},
            execution_authorized:false},400);
        if(explicitlySelectedNetwork!==null && !existingPaymentSignature &&
           !explicitlyConfiguredNoCardCheckout())
          return json({ok:false,chargeable:false,payment_required_now:false,
            error:{code:"MAINNET_SELECTED_NETWORK_NOT_LIVE"},
            execution_authorized:false},503);
        if(noCardProof || (!existingPaymentSignature && explicitlyConfiguredNoCardCheckout())){
          return handleNoCardAdaptiveCheckout({
            request,plan,requestBody:parsed,
            clientRequestId:parsed.client_request_id??null,
            replayOnly:!explicitlyConfiguredNoCardCheckout(),
          });
        }

        // Paid published-only requests continue using the identical Coinbase
        // configuration gate. The live_on_demand branch above is a strictly
        // no-charge, fail-closed search probe and MUST work even before any
        // wallet, CDP API key or Coinbase environment is provisioned.
        // Never let a payment-signature header promote discovery to delivery.
        let config: CoinbaseX402Config | null;
        try { config = getCoinbaseX402Config(); } catch (error) {
          return json({ ok: false, error: { code: "COINBASE_X402_CONFIGURATION_INVALID", message: error instanceof Error ? error.message : "Invalid x402 configuration" }, execution_authorized: false }, 503);
        }
        if (!config) return json({ ok: false, error: { code: "COINBASE_X402_NOT_CONFIGURED", message: "Coinbase x402 is not enabled." }, execution_authorized: false }, 503);

        const requestFingerprint=coinbaseRequestFingerprint({product:PRODUCT_ID,query_plan_hash:plan.query_plan_hash,request:parsed});
        const paymentHeader=request.headers.get("payment-signature");
        let paymentPayload!:Record<string,unknown>;
        if(paymentHeader) {
          try {
            paymentPayload=decodeCoinbasePaymentHeader(paymentHeader);
            const quote=capabilityQuoteFromPaymentPayload(paymentPayload);
            const prior=await readAlreadyDeliveredCapabilityReplay({
              quote,paymentPayload,paymentFingerprint:coinbasePaymentFingerprint(paymentPayload),
              requestFingerprint,config,
            });
            if(prior) {
              assertFrozenCapabilityResponse(prior.response);
              const receipt=replaySettlement(prior.settlementReference,prior.settlementNetwork);
              return sendFrozenCapabilityHttpBody(freezeCanonicalCapabilityHttpBody(prior.response),prior.responseSha256,{
                ...corsHeaders,...licensedPaidDeliveryHeaders(prior.response),
                "PAYMENT-RESPONSE":coinbaseX402PaymentResponseHeader(receipt),
                "X-Geomacro-Quote-ID":quote.quote_id,
              });
            }
          } catch {
            return json({ok:false,chargeable:false,error:{code:"X402_DELIVERED_REPLAY_PROOF_INVALID_OR_UNAVAILABLE"},execution_authorized:false},409);
          }
        }

        // Preserve authenticated already-settled replay above. New Risk Gate
        // quotes, verification and settlement are held for a future launch.
        // This is GeoMacro public commerce only, never the PREDGE route.
        if(plan.product?.capability==="risk_gate_bundle" || plan.topics.includes("risk_gate"))
          return json({ok:false,chargeable:false,payment_required_now:false,
            error:{code:"RISK_GATE_COMING_SOON_NO_CHARGE"},execution_authorized:false},422);

        if (!config.apiKeyId || !config.apiKeySecret) {
          return json({ok:false,chargeable:false,error:{code:"CDP_API_CREDENTIALS_MISSING"},execution_authorized:false},503);
        }
        let availability;
        try {
          availability = await checkAgentQueryDeliverability(plan, { externalModuleChecker: checkAgentQueryExternalModule });
        } catch (error) {
          console.error("[x402-adaptive] pre-payment deliverability failed", error);
          return json({ok:false,chargeable:false,payment_required_now:false,payment_authorized:false,
            error:{code:"AVAILABILITY_CHECK_UNAVAILABLE",message:"Deliverability could not be proven. Payment is disabled for this request."},
            recovery:{retryable:true,automatic_retry:false,retry_after_seconds:120,
              next_availability_endpoint:"/api/v1/intelligence/products-availability",
              evidence_generation_authorized:false},execution_authorized:false},503,{"Retry-After":"120"});
        }
        if (!availability.deliverable) {
          // Existing 422 status and availability contract remain unchanged. Add an
          // explicitly zero-price machine receipt *before* any payment claim.
          const noChargeReason = availability.code === "STALE_REQUIRED_DATA"
            ? "STALE_NO_CHARGE" as const
            : availability.code === "INSUFFICIENT_COVERAGE"
              ? "INSUFFICIENT_EVIDENCE_NO_CHARGE" as const
              : "UNAVAILABLE_NO_CHARGE" as const;
          const no_charge = makeGeomacroNoChargeResponse({
            request_id: randomUUID(), capability: "intelligence_query",
            subject: {type:"query", id:plan.query_plan_hash},
            reason: noChargeReason,
            reason_detail: "Verified deliverable evidence is not available; this request was not charged.",
            payment_attempted:false,delivery_committed:false,
          });
          return json({ ok: false, chargeable: false, payment_required_now: false,
            no_charge, availability: publicAgentQueryAvailability(availability),
            error: { code: availability.code, message: "Requested intelligence is not currently fully deliverable; no payment is accepted." }, execution_authorized: false }, 422);
        }
        // The same verified capability-price configuration travels through the
        // HTTP 402, signed payment binding, durable claim, usage guard,
        // prepared response, and final settlement. No mutable client price.
        try {
          config = resolveEligibleCoinbaseCapabilityConfig(plan, availability, config);
        } catch {
          return json({ ok: false, chargeable: false, payment_required_now: false,
            error: { code: "CAPABILITY_PRICE_UNVERIFIED_NO_CHARGE" },
            execution_authorized: false }, 422);
        }

        if (!paymentHeader) {
          if(!allowPublicDemoRequest(request,{namespace:"capability-prequote-offer",windowMs:60_000,maxPerClient:2,maxGlobal:12}))
            return json({ok:false,chargeable:false,error:{code:"CAPABILITY_PREQUOTE_RATE_LIMITED"},execution_authorized:false},429);
          try {
            const offered=await prepareVerifiedCapabilityOffer({
              plan,availability,clientRequestId:parsed.client_request_id??null,
              requestFingerprint,rail:"coinbase_x402",network:config.network,asset:config.asset,recipient:config.payTo,
            });
            return paymentRequiredResponse(request,config,plan.query_plan_hash,offered.quote);
          } catch {
            return json({ok:false,chargeable:false,payment_required_now:false,
              error:{code:"CAPABILITY_SIGNED_PREQUOTE_UNAVAILABLE"},execution_authorized:false},422);
          }
        }
        let capabilityQuote:CapabilityQuote;
        let frozenIntelligence:Record<string,unknown>;
        try {
          const proposed=capabilityQuoteFromPaymentPayload(paymentPayload);
          const frozen=await readVerifiedCapabilityAnswer({quote:proposed,requestFingerprint});
          capabilityQuote=frozen.quote;
          frozenIntelligence=frozen.intelligence;
          const price=resolveEligiblePublishedCapabilityPrice(plan,availability);
          if(price.capability!==capabilityQuote.capability || price.variant!==capabilityQuote.variant ||
             price.amount_atomic!==capabilityQuote.amount_atomic) throw Error("CAPABILITY_CLASS_CHANGED");
          assertCapabilityPaymentBinding(paymentPayload,capabilityQuote,coinbaseRequirementsForCapabilityQuote(config,capabilityQuote));
          assertCoinbasePaymentBinding(paymentPayload,config);
          assertAdaptiveQueryBinding(paymentPayload,plan.query_plan_hash);
        } catch {
          return json({ok:false,chargeable:false,error:{code:"X402_CAPABILITY_QUOTE_OR_PAYMENT_BINDING_INVALID"},execution_authorized:false},402);
        }

        const paymentFingerprint = coinbasePaymentFingerprint(paymentPayload);
        const ledgerRequestFingerprint=capabilityLedgerRequestFingerprint(capabilityQuote);
        let claim;
        try {
          claim = await claimCoinbaseX402Delivery({ paymentFingerprint, requestFingerprint:ledgerRequestFingerprint, clientRequestId: parsed.client_request_id ?? null, config });
        } catch (error) {
          console.error("[x402-adaptive] delivery claim failed", error);
          return json({ ok: false, error: { code: "X402_DELIVERY_LEDGER_UNAVAILABLE", message: "Paid delivery ledger is unavailable." }, execution_authorized: false }, 503);
        }

        if (claim.disposition === "CONFLICT") return json({ ok: false, error: { code: "X402_PAYMENT_REPLAY_CONFLICT", message: "This payment proof is already bound to a different query." }, execution_authorized: false }, 409);
        if (claim.disposition === "IN_PROGRESS") return json({ ok: false, error: { code: "X402_REQUEST_IN_PROGRESS", message: "This exact paid query is already processing." }, execution_authorized: false }, 409, { "Retry-After": "2" });
        if (claim.disposition === "MANUAL_REVIEW") return json({ ok: false, error: { code: "X402_SETTLEMENT_RECONCILIATION_REQUIRED", message: "A prior settlement outcome is ambiguous; automatic re-charge is blocked." }, execution_authorized: false }, 503);
        if (claim.disposition === "REPLAY" && claim.response_payload) {
          const settlement = replaySettlement(claim.settlement_tx, claim.settlement_network);
          const response=claim.response_payload as Record<string,unknown>;
          assertFrozenCapabilityResponse(response);
          if(claim.response_sha256!==capabilityQuote.prepared_answer_sha256) return json({ok:false,chargeable:false,error:{code:"X402_REPLAY_IMMUTABLE_BYTES_MISMATCH"}},409);
          return sendFrozenCapabilityHttpBody(freezeCanonicalCapabilityHttpBody(response),claim.response_sha256,{
            ...corsHeaders,...licensedPaidDeliveryHeaders(claim.response_payload as Record<string,unknown>),
            "PAYMENT-RESPONSE":coinbaseX402PaymentResponseHeader(settlement),"X-Geomacro-Quote-ID":capabilityQuote.quote_id,
          });
        }
        if (claim.disposition !== "CLAIMED" || !claim.claim_token) return json({ ok: false, error: { code: "X402_DELIVERY_CLAIM_FAILED", message: "Unable to claim this paid query." }, execution_authorized: false }, 503);
        const claimToken = claim.claim_token;

        let verified;
        try { verified = await verifyCoinbaseX402(paymentPayload, config); } catch (error) {
          await releaseCoinbaseX402DeliveryForRetry({ paymentFingerprint, claimToken, failureCode: error instanceof Error ? error.message : "CDP_VERIFY_FAILED" });
          return json({ ok: false, error: { code: "X402_VERIFY_UNAVAILABLE", message: "Coinbase payment verification is temporarily unavailable." }, execution_authorized: false }, 503);
        }
        if (!verified.isValid) {
          await releaseCoinbaseX402DeliveryForRetry({ paymentFingerprint, claimToken, failureCode: verified.invalidReason ?? "CDP_VERIFY_INVALID" });
          return json({ ok: false, error: { code: "X402_PAYMENT_INVALID", reason: verified.invalidReason ?? "invalid_payment", message: verified.invalidMessage ?? "Payment authorization is invalid." }, execution_authorized: false }, 402);
        }

        let usageReservation;
        try {
          usageReservation = await reserveCoinbaseX402AgentUsage({ paymentFingerprint, payer: verified.payer, config });
        } catch (error) {
          await releaseCoinbaseX402DeliveryForRetry({ paymentFingerprint, claimToken, failureCode: error instanceof Error ? error.message : "X402_USAGE_GUARD_UNAVAILABLE" });
          return json({ ok: false, chargeable: false, error: { code: "X402_USAGE_GUARD_UNAVAILABLE", message: "Agent spend controls could not be proven; settlement is disabled." }, execution_authorized: false }, 503);
        }
        if (!["RESERVED", "NOT_ENFORCED_TESTNET"].includes(usageReservation.disposition)) {
          await releaseCoinbaseX402DeliveryForRetry({ paymentFingerprint, claimToken, failureCode: `X402_USAGE_${usageReservation.disposition}` });
          const status = usageReservation.disposition === "SPEND_LIMIT" || usageReservation.disposition === "REQUEST_LIMIT" ? 429 : 409;
          return json({ ok: false, chargeable: false, error: { code: `X402_USAGE_${usageReservation.disposition}`, message: "Agent spending or usage policy blocked this settlement." }, execution_authorized: false }, status);
        }

        let finalAvailability;
        try {
          finalAvailability = await checkAgentQueryDeliverability(plan, { externalModuleChecker: checkAgentQueryExternalModule });
        } catch (error) {
          await releaseCoinbaseX402DeliveryForRetry({ paymentFingerprint, claimToken, failureCode: "FINAL_AVAILABILITY_CHECK_FAILED" });
          if (usageReservation.enforced) await releaseCoinbaseX402AgentUsage(paymentFingerprint);
          return json({ ok: false, chargeable: false, error: { code: "FINAL_AVAILABILITY_CHECK_FAILED", message: "Final deliverability could not be proven; no settlement was attempted." }, execution_authorized: false }, 503);
        }
        if (!finalAvailability.deliverable) {
          await releaseCoinbaseX402DeliveryForRetry({ paymentFingerprint, claimToken, failureCode: `FINAL_${finalAvailability.code}` });
          if (usageReservation.enforced) await releaseCoinbaseX402AgentUsage(paymentFingerprint);
          return json({ ok: false, chargeable: false, availability: publicAgentQueryAvailability(finalAvailability), error: { code: `FINAL_${finalAvailability.code}`, message: "Required data changed before settlement; no payment was taken." }, execution_authorized: false }, 409);
        }
        // A plan can become ineligible or change its price class after the
        // original quote. Never settle against an unverified final capability.
        try {
          const price=resolveEligiblePublishedCapabilityPrice(plan,finalAvailability);
          if(price.capability!==capabilityQuote.capability || price.variant!==capabilityQuote.variant)
            throw Error("FINAL_CAPABILITY_CLASS_CHANGED");
          const finalConfig = resolveEligibleCoinbaseCapabilityConfig(plan, finalAvailability, config);
          if (finalConfig.amountAtomic !== config.amountAtomic ||
              finalConfig.priceUsdc !== config.priceUsdc) {
            throw Error("FINAL_CAPABILITY_PRICE_MISMATCH");
          }
        } catch {
          await releaseCoinbaseX402DeliveryForRetry({ paymentFingerprint, claimToken,
            failureCode: "FINAL_CAPABILITY_PRICE_UNVERIFIED" });
          if (usageReservation.enforced) await releaseCoinbaseX402AgentUsage(paymentFingerprint);
          return json({ ok: false, chargeable: false, payment_required_now: false,
            error: { code: "FINAL_CAPABILITY_PRICE_UNVERIFIED" },
            execution_authorized: false }, 409);
        }

        const requestId = String(frozenIntelligence.request_id);
        let frozenHttpBody:FrozenCapabilityHttpBody;
        let prepared: Record<string, unknown>;
        let preparedResponseSha256: string;
        try {
          // Return the entire immutable body frozen before the initial 402.
          prepared=frozenIntelligence;
          assertFrozenCapabilityResponse(prepared);
          frozenHttpBody=freezeCanonicalCapabilityHttpBody(prepared);
          if(frozenHttpBody.sha256!==capabilityQuote.prepared_answer_sha256) throw Error("X402_PREQUOTE_BODY_MISMATCH");
          const preparedResult = await prepareCoinbaseX402Delivery({
            paymentFingerprint,
            claimToken,
            responsePayload: prepared,
          });
          preparedResponseSha256 = preparedResult.responseSha256;
          if(preparedResponseSha256!==frozenHttpBody.sha256) throw Error("X402_FINAL_HTTP_LEDGER_BODY_HASH_MISMATCH");
          await upsertCoinbaseX402ProductAudit({
            requestId,
            clientRequestId: parsed.client_request_id ?? null,
            paymentFingerprint,
            queryPlanHash: plan.query_plan_hash,
            productId: PRODUCT_ID,
            deliveredProductHash: String(prepared.delivered_product_hash),
            status: "prepared",
            config,
          });
        } catch (error) {
          await releaseCoinbaseX402DeliveryForRetry({ paymentFingerprint, claimToken, failureCode: error instanceof Error ? error.message : "PRODUCT_PREPARATION_FAILED" });
          if (usageReservation.enforced) await releaseCoinbaseX402AgentUsage(paymentFingerprint);
          return json({ ok: false, chargeable: false, error: { code: "PRODUCT_PREPARATION_FAILED", message: "Requested intelligence could not be durably prepared; no settlement was attempted." }, execution_authorized: false }, 503);
        }

        try {assertAcceptedCapabilityQuote(capabilityQuote);assertFrozenCapabilityCurrentForSettlement(prepared);} catch {
          await releaseCoinbaseX402DeliveryForRetry({paymentFingerprint,claimToken,failureCode:"CAPABILITY_QUOTE_EXPIRED_BEFORE_SETTLEMENT"});
          if(usageReservation.enforced) await releaseCoinbaseX402AgentUsage(paymentFingerprint);
          return json({ok:false,chargeable:false,error:{code:"CAPABILITY_QUOTE_EXPIRED_BEFORE_SETTLEMENT"},execution_authorized:false},409);
        }
        let settlement: CoinbaseSettleResult;
        try { settlement = await settleCoinbaseX402(paymentPayload, config); } catch (error) {
          await releaseCoinbaseX402DeliveryForRetry({ paymentFingerprint, claimToken, failureCode: error instanceof Error ? error.message : "CDP_SETTLE_AMBIGUOUS", manualReview: true });
          if (usageReservation.enforced) await releaseCoinbaseX402AgentUsage(paymentFingerprint, true);
          try { await upsertCoinbaseX402ProductAudit({ requestId, clientRequestId: parsed.client_request_id ?? null, paymentFingerprint, queryPlanHash: plan.query_plan_hash, productId: PRODUCT_ID, deliveredProductHash: String(prepared.delivered_product_hash ?? ""), status: "manual_review", config }); } catch (auditError) { console.error("[x402-adaptive] manual review audit failed", auditError); }
          return json({ ok: false, error: { code: "X402_SETTLEMENT_AMBIGUOUS", message: "Settlement outcome is ambiguous. The proof is locked against automatic re-charge pending reconciliation." }, execution_authorized: false }, 503);
        }

        if (!settlement.success) {
          const duplicateWithTx = settlement.errorReason === "duplicate_settlement" && typeof settlement.transaction === "string" && /^0x[a-fA-F0-9]{64}$/.test(settlement.transaction);
          if (!duplicateWithTx) {
            const manual = settlement.errorReason === "duplicate_settlement";
            await releaseCoinbaseX402DeliveryForRetry({ paymentFingerprint, claimToken, failureCode: settlement.errorReason ?? "CDP_SETTLEMENT_FAILED", manualReview: manual });
            if (usageReservation.enforced) await releaseCoinbaseX402AgentUsage(paymentFingerprint, manual);
            return json({ ok: false, error: { code: manual ? "X402_SETTLEMENT_RECONCILIATION_REQUIRED" : "X402_PAYMENT_FAILED", reason: settlement.errorReason ?? "settlement_failed", message: manual ? "A prior settlement may exist without a safe transaction reference; automatic re-charge is blocked." : settlement.errorMessage ?? "Payment settlement failed." }, execution_authorized: false }, manual ? 503 : 402);
          }
          settlement = { ...settlement, success: true };
        }

        if (typeof settlement.transaction !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(settlement.transaction)) {
          await releaseCoinbaseX402DeliveryForRetry({ paymentFingerprint, claimToken, failureCode: "CDP_SETTLEMENT_TX_MISSING", manualReview: true });
          if (usageReservation.enforced) await releaseCoinbaseX402AgentUsage(paymentFingerprint, true);
          return json({ ok: false, error: { code: "X402_SETTLEMENT_RECONCILIATION_REQUIRED", message: "Settlement reported success without a valid EVM transaction hash." }, execution_authorized: false }, 503);
        }

        try {
          await completeCoinbaseX402Delivery({ paymentFingerprint, claimToken, payer: settlement.payer ?? verified.payer ?? null, settlementTx: settlement.transaction, settlementNetwork: settlement.network ?? config.networkName });
          if (usageReservation.enforced) await finalizeCoinbaseX402AgentUsage(paymentFingerprint);
        } catch (error) {
          await releaseCoinbaseX402DeliveryForRetry({
            paymentFingerprint,
            claimToken,
            failureCode: "COINBASE_POST_SETTLEMENT_LEDGER_FAILURE",
            manualReview: true,
          }).catch(() => undefined);
          if (usageReservation.enforced) {
            await releaseCoinbaseX402AgentUsage(paymentFingerprint, true).catch(() => undefined);
          }
          console.error("[x402-adaptive] post-settlement durable finalization failed", error);
          return json({ ok: false, error: { code: "X402_POST_SETTLEMENT_RECONCILIATION_REQUIRED", message: "Payment settled but durable finalization requires reconciliation. Automatic re-charge remains blocked." }, settlement_reference: settlement.transaction, execution_authorized: false }, 503, { "PAYMENT-RESPONSE": coinbaseX402PaymentResponseHeader(settlement) });
        }

        const bazaar = bazaarExtensionOutcome(verified, settlement);
        await persistCoinbaseSettlementTelemetry({
          requestId,
          payer: settlement.payer ?? verified.payer ?? null,
          settlementTx: settlement.transaction,
          settlementNetwork: settlement.network ?? config.networkName,
          config,
          paymentFingerprint,
          responseSha256: preparedResponseSha256,
          capability: "adaptive_risk_intelligence_coinbase_x402",
          bazaarExtensionEchoed: paymentPayloadEchoesBazaar(paymentPayload),
          bazaarStatus: bazaar.status,
          bazaarRejectedReason: bazaar.rejectedReason,
        });
        try {
          await upsertCoinbaseX402ProductAudit({ requestId, clientRequestId: parsed.client_request_id ?? null, paymentFingerprint, queryPlanHash: plan.query_plan_hash, productId: PRODUCT_ID, deliveredProductHash: String(prepared.delivered_product_hash ?? ""), settlementTx: settlement.transaction, status: "delivered", config });
        } catch (error) {
          console.error("[x402-adaptive] post-settlement audit projection failed; delivery ledger remains canonical", error);
        }

        return sendFrozenCapabilityHttpBody(frozenHttpBody,preparedResponseSha256,{
          ...corsHeaders,...licensedPaidDeliveryHeaders(prepared),
          "PAYMENT-RESPONSE":coinbaseX402PaymentResponseHeader(settlement),"X-Geomacro-Quote-ID":capabilityQuote.quote_id,
        });
      },
};

