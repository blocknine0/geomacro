import { createFileRoute } from "@tanstack/react-router";
import { ZodError } from "zod";
import { allowPublicDemoRequest } from "../lib/public-demo-rate-limit.server";
import {
  MULTILINGUAL_QUERY_SCHEMA,
  interpretMultilingualIntelligenceQuery,
} from "../lib/multilingual-query-intent";

const MAX_BYTES = 8192;
const HEADERS = {
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};
const reply = (body: unknown, status = 200) =>
  Response.json(body, {status, headers: HEADERS});
const noChargeError = (code: string, status = 400) =>
  reply({ok:false, schema_version:MULTILINGUAL_QUERY_SCHEMA,
    error:{code}, chargeable:false, payment_required_now:false,
    charged_now:false, execution_authorized:false},status);

/**
 * Pure interpretation/discovery, never a paywall or preflight shortcut.
 * The returned exact canonical_request is subsequently evaluated by the
 * existing products-availability and x402 handlers with ALL existing guards.
 */
export async function interpretIntelligenceHttp(request:Request):Promise<Response> {
  const url = new URL(request.url);
  if (url.search || url.hash) return noChargeError("INTERPRET_QUERY_STRING_UNSUPPORTED");
  if (request.headers.has("authorization") || request.headers.has("payment-signature") ||
      request.headers.has("payment-required"))
    return noChargeError("INTERPRET_PAYMENT_HEADERS_FORBIDDEN");
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type")??""))
    return noChargeError("INTERPRET_JSON_REQUIRED",415);
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/u.test(declared) || Number(declared)>MAX_BYTES))
    return noChargeError("INTERPRET_REQUEST_TOO_LARGE",413);
  if (!allowPublicDemoRequest(request, {namespace:"geomacro-multilingual-query-interpret",
      windowMs:60_000,maxPerClient:12,maxGlobal:120}))
    return noChargeError("INTERPRET_RATE_LIMITED",429);
  let raw:string;
  try { raw=await request.text(); } catch {
    return noChargeError("INTERPRET_BODY_READ_FAILED");
  }
  if (new TextEncoder().encode(raw).byteLength>MAX_BYTES)
    return noChargeError("INTERPRET_REQUEST_TOO_LARGE",413);
  try {
    return reply(interpretMultilingualIntelligenceQuery(JSON.parse(raw)));
  } catch(error) {
    if (error instanceof SyntaxError || error instanceof ZodError)
      return noChargeError("INTERPRET_INVALID_REQUEST");
    // Deterministic classifier errors are public machine codes only.
    const known = new Set([
      "SUBJECT_REQUIRED_PROVIDE_COUNTRY_ISO3", "TOO_MANY_COUNTRY_SUBJECTS",
      "DIRECTIONAL_CORRIDOR_REQUIRES_TWO_DISTINCT_ENDPOINTS",
      "CORRIDOR_DIRECTION_UNCLEAR", "MULTIPLE_SUBJECTS_NEED_COMPARISON_OR_DIRECTION",
      "EXPLICIT_SUBJECTS_CONTRADICT_QUESTION",
      "UNSUPPORTED_QUERY_TOPIC_PROVIDE_ENUM", "EXPLICIT_TOPICS_CONTRADICT_QUESTION",
      "AMBIGUOUS_QUERY_INTENT", "STRUCTURAL_PRODUCT_CURRENT_NEWS_NOT_SUPPORTED",
      "DIGEST_REQUIRES_ONE_DIMENSION", "PROFILE_REQUIRES_AT_LEAST_TWO_DIMENSIONS",
      "FOCUSED_REQUIRES_ONE_SEMANTIC_TOPIC",
      "STANDARD_REQUIRES_ONE_SUBJECT_UP_TO_THREE_TOPICS",
      "RISK_GATE_CONTEXT_REQUIRED", "SIGNED_NEW_REQUIRES_ISSUED_AFTER",
      "QUERY_INTENT_CONFLICT", "STORE_STRUCTURAL_QUESTION_SCOPE_UNSUPPORTED",
      "STORE_STRUCTURAL_PRODUCT_SCOPE_MISMATCH", "STORE_STRUCTURAL_PRODUCT_DIMENSIONS_REQUIRED",
      "STORE_INTELLIGENCE_QUERY_SCOPE_MISMATCH", "STORE_SIGNED_OBJECT_SCOPE_MISMATCH",
      "STORE_RISK_GATE_SCOPE_MISMATCH", "UNSUPPORTED_OR_AMBIGUOUS_AGENT_QUESTION",
      "RANKING_FILTER_REQUIRES_MULTIPLE_SUBJECTS_AND_RANKING_SPEC",
      "CHANGE_SINCE_REQUIRES_ONE_SUBJECT_AND_BASELINE_SPEC",
      "RISK_GATE_CONTEXT_WITHOUT_RISK_GATE", "HISTORICAL_AS_OF_UNSUPPORTED_FOR_REQUESTED_MODULES",
    ]);
    const code = error instanceof Error && known.has(error.message)
      ? error.message : "INTERPRET_UNSUPPORTED_OR_AMBIGUOUS";
    return noChargeError(code);
  }
}
export const Route = createFileRoute("/api/v1/intelligence/interpret")({
  server:{handlers:{
    OPTIONS:async()=>new Response(null,{status:204,headers:HEADERS}),
    GET:async()=>reply({
      ok:true,schema_version:MULTILINGUAL_QUERY_SCHEMA,
      mode:"NO_FUNDS_DETERMINISTIC_QUERY_NORMALIZATION",
      method:"POST",endpoint:"/api/v1/intelligence/interpret",
      request_example:{question:"ভারতের মুদ্রাস্ফীতি ও বৈদেশিক মুদ্রার রিজার্ভ",
        language:"bn"},
      optional_inputs:["language","subjects","topics","product","ranking",
        "change","risk_gate_context","as_of","max_age_seconds","client_request_id"],
      country_catalog:"195_UN_MEMBER_AND_OBSERVER_COUNTRIES",
      language_support:"19_LOCALE_COUNTRY_NAME_MATCHING_BOUNDED_SEMANTIC_LEXICON",
      global_language_fallback:"SUPPLY_EXPLICIT_ISO3_SUBJECTS_AND_ENUM_TOPICS",
      next_availability_endpoint:"/api/v1/intelligence/products-availability",
      canonical_purchase_endpoint:"/api/v1/intelligence/query",
      interpretation_is_not_evidence_proof:true,
      payment_authorized:false,execution_authorized:false,
    }),
    POST:async ({request}:{request:Request})=>interpretIntelligenceHttp(request),
  }},
});
