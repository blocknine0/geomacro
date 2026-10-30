import { buildAgentQueryPlan, inferAgentQueryTopics, type AgentQueryTopic } from "./agent-query-plan";
import { mainnetIntelligenceHandlers } from "./mainnet-intelligence-endpoint.server";
import {canonicalCheckoutUrl} from "./x402-checkout-network-selection";
import { publicIntelligenceSourceCoverage, type CommercialIntelligenceCategory } from "./public-intelligence-source-coverage";
import { categoryOriginalSourcePulse } from "./current-30min-original-source-pulse.server";
import { readCategoryLiveObservation } from "./category-live-observation.server";
import { readCategoryOpenData } from "./category-open-data.server";
import {automatedFindsResponse} from "./automated-finds-reader.server";

const MAX_BODY_BYTES = 32 * 1024;
const CANONICAL_PATH = "/api/v1/intelligence/query";

type CategoryConfig = {
  category?: string;
  path?: string;
  topics: readonly AgentQueryTopic[];
  requiredModules: readonly string[];
};

export function bindCategoryAliasPayload(
  raw: unknown,
  config: CategoryConfig,
): { ok: true; payload: Record<string, unknown> } | { ok: false; code: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, code: "INVALID_CATEGORY_QUERY" };
  }

  const body = raw as Record<string, unknown>;
  if (!Array.isArray(body.subjects) || body.subjects.length < 1 || body.subjects.length > 25) {
    return { ok: false, code: "CATEGORY_SUBJECT_REQUIRED" };
  }
  if (!body.subjects.every((subject) =>
    subject && typeof subject === "object" && !Array.isArray(subject) &&
    (subject as Record<string, unknown>).type === "country"
  )) {
    return { ok: false, code: "CATEGORY_COUNTRY_SUBJECTS_ONLY" };
  }

  if (body.topics !== undefined) {
    if (!Array.isArray(body.topics)) return { ok: false, code: "CATEGORY_TOPIC_SCOPE_MISMATCH" };
    const supplied = body.topics.map(String).sort();
    const expected = [...config.topics].sort();
    if (
      supplied.length !== expected.length ||
      new Set(supplied).size !== supplied.length ||
      supplied.some((topic, index) => topic !== expected[index])
    ) {
      return { ok: false, code: "CATEGORY_TOPIC_SCOPE_MISMATCH" };
    }
  }

  if (typeof body.question === "string") {
    const inferredTopics = inferAgentQueryTopics(body.question);
    if (inferredTopics.some((topic) => !config.topics.includes(topic))) {
      return { ok: false, code: "CATEGORY_QUESTION_SCOPE_MISMATCH" };
    }
  }

  // Category-specific question APIs are the canonical *on-demand* product.
  // The legacy canonical query endpoint still defaults to published_only;
  // an explicitly selected published_only request remains byte-for-byte
  // compatible with its existing payment-bound query plan. Incomplete live
  // discovery stays no-charge and cannot become a paid signed result.
  const payload = {
    ...body,
    topics: [...config.topics],
    fulfillment_mode: body.fulfillment_mode === undefined
      ? "live_on_demand" : body.fulfillment_mode,
  };
  try {
    const plan = buildAgentQueryPlan(payload);
    const modules = [...plan.required_modules].sort();
    const expectedModules = [...config.requiredModules].sort();
    if (
      plan.intent !== "single_subject" ||
      modules.length !== expectedModules.length ||
      modules.some((module, index) => module !== expectedModules[index])
    ) {
      return { ok: false, code: "CATEGORY_INTENT_SCOPE_MISMATCH" };
    }

  } catch {
    return { ok: false, code: "INVALID_CATEGORY_QUERY" };
  }

  return { ok: true, payload };
}

function errorResponse(code: string, status = 400) {
  return Response.json(
    {
      ok: false,
      chargeable: false,
      payment_required_now: false,
      error: { code, message: "This category endpoint accepts only its fixed governed topic scope." },
      execution_authorized: false,
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, PAYMENT-SIGNATURE, payment-signature",
        "Access-Control-Expose-Headers": "PAYMENT-REQUIRED, PAYMENT-RESPONSE",
      },
    },
  );
}

function canonicalGetRequest(request: Request) {
  const url = new URL(CANONICAL_PATH, request.url);
  return new Request(url, { method: "GET", headers: request.headers });
}

export function createCategoryIntelligenceHandlers(config: CategoryConfig) {
  return {
    OPTIONS: async () => mainnetIntelligenceHandlers.OPTIONS(),
    GET: async ({ request }: { request: Request }) => {
      if(new URL(request.url).searchParams.get("view")==="finds")
        return automatedFindsResponse(request,config.category);
      if (new URL(request.url).searchParams.get("view") === "combined") {
        // One canonical category endpoint: original-date official releases
        // and structured source data remain separated by type and clocks.
        // No current-event claim may be inferred from reference periods.
        if (!config.category || !["geopolitics","macro-fx","critical-minerals"].includes(config.category))
          return errorResponse("CATEGORY_COMBINED_VIEW_NOT_AVAILABLE",404);
        const category=config.category as CommercialIntelligenceCategory;
        const [releases,data]=await Promise.allSettled([
          readCategoryLiveObservation(category),
          readCategoryOpenData(category),
        ]);
        const releasesRead = releases.status==="fulfilled" &&
          releases.value.status!=="OFFICIAL_SOURCES_UNAVAILABLE";
        const dataRead = data.status==="fulfilled" &&
          data.value.source_families_readable>0;
        if (!releasesRead && !dataRead) {
          return Response.json({
            ok:false,category,chargeable:false,signed_gro_generated:false,
            error:{code:"CATEGORY_SOURCE_READERS_UNAVAILABLE"},
          },{status:503,headers:{"Cache-Control":"no-store",
            "X-Content-Type-Options":"nosniff","Access-Control-Allow-Origin":"*"}});
        }
        return Response.json({
          schema_version:"geomacro.category-combined-coverage.v1",
          ok:true,category,
          coverage_status:releasesRead&&dataRead
            ?"BOTH_SOURCE_CLASSES_READABLE":"PARTIAL_SOURCE_CLASS_AVAILABILITY",
          original_release_observations: releases.status==="fulfilled"
            ? releases.value : null,
          structured_open_data: data.status==="fulfilled" ? data.value : null,
          source_class_count_readable:Number(releasesRead)+Number(dataRead),
          current_signed_risk_intelligence_verified:false,
          signed_gro_generated:false,x402_payment_required:false,
          chargeable:false,raw_publisher_content_delivered:false,
          durable_storage_written:false,
        },{status:200,headers:{"Cache-Control":"no-store",
          "X-Content-Type-Options":"nosniff","Access-Control-Allow-Origin":"*"}});
      }
      // Distinct provider-native measurements and dataset reference periods.
      // Never inflate the original-release news feed or change x402 POST.
      if (new URL(request.url).searchParams.get("view") === "open-data") {
        if (!config.category || !["geopolitics","macro-fx","critical-minerals"].includes(config.category))
          return errorResponse("CATEGORY_OPEN_DATA_VIEW_NOT_AVAILABLE",404);
        try {
          const result = await readCategoryOpenData(config.category as CommercialIntelligenceCategory);
          return Response.json(result,{status:200,headers:{
            "Cache-Control":"no-store",
            "X-Content-Type-Options":"nosniff",
            "Access-Control-Allow-Origin":"*",
          }});
        }catch{
          return Response.json({
            ok:false,category:config.category,chargeable:false,
            signed_gro_generated:false,
            error:{code:"CATEGORY_OPEN_DATA_RETRIEVAL_UNAVAILABLE"},
          },{status:503,headers:{
            "Cache-Control":"no-store",
            "X-Content-Type-Options":"nosniff",
            "Access-Control-Allow-Origin":"*",
          }});
        }
      }
      // Explicit no-charge original-release mode, independent from Coinbase
      // mainnet configuration. The default GET continues to describe x402
      // pricing/discovery, and all POST requests retain canonical binding.
      if (new URL(request.url).searchParams.get("view") === "latest") {
        if (!config.category || !Object.prototype.hasOwnProperty.call({
          geopolitics: true, "macro-fx": true, "critical-minerals": true,
        }, config.category)) return errorResponse("CATEGORY_LIVE_VIEW_NOT_AVAILABLE", 404);
        try {
          const observation = await readCategoryLiveObservation(
            config.category as CommercialIntelligenceCategory,
          );
          return Response.json(observation, {
            status: 200,
            headers: {
              "Cache-Control": "no-store",
              "X-Content-Type-Options": "nosniff",
              "Access-Control-Allow-Origin": "*",
            },
          });
        } catch {
          return Response.json({
            ok: false,
            category: config.category,
            error: { code: "CATEGORY_OFFICIAL_SOURCE_RETRIEVAL_UNAVAILABLE" },
            chargeable: false,
            x402_payment_required: false,
            signed_gro_generated: false,
          }, { status: 503, headers: {
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "Access-Control-Allow-Origin": "*",
          } });
        }
      }
      const response = await mainnetIntelligenceHandlers.GET({ request: canonicalGetRequest(request) });
      // Keep configuration failures and the actual payment environment intact.
      // Discovery describes this fixed scope; it is not evidence of fresh data.
      if (!response.ok) return response;
      const discovery = await response.json();
      const sourcePulse = config.category
        ? await categoryOriginalSourcePulse(config.category as CommercialIntelligenceCategory)
        : null;
      return Response.json({
        ...discovery,
        endpoint: new URL(config.path ?? new URL(request.url).pathname, request.url).toString(),
        canonical_endpoint: new URL(CANONICAL_PATH, request.url).toString(),
        ...(config.category ? { category: config.category } : {}),
        ...(sourcePulse ? { original_publisher_observation: sourcePulse } : {}),
        topics: [...config.topics],
        required_modules: [...config.requiredModules],
        supported_subject_types: ["country"],
        supported_intents: ["single_subject"],
        availability_check: "POST_WITHOUT_PAYMENT_SIGNATURE",
        ...(config.category ? {
          // Informational, dated catalog coverage only. Not scored observations
          // and NEVER a replacement for POST paid-availability checks.
          source_intake: publicIntelligenceSourceCoverage(config.category as CommercialIntelligenceCategory),
        } : {}),
        freshness: {
          policy: "PER_MODULE_SOURCE_NATIVE_CADENCE",
          request_override: "max_age_seconds",
          override_can_only_tighten: true,
          discovery_proves_current_data: false,
        },
      }, { status: response.status, headers: response.headers });
    },
    POST: async ({ request }: { request: Request }) => {
      // Do not drop a buyer's Polygon choice when remapping any of the three
      // category aliases to the canonical x402 resource.
      let checkoutUrl:URL;
      try{checkoutUrl=canonicalCheckoutUrl(request,CANONICAL_PATH);}
      catch{return errorResponse("CATEGORY_NETWORK_QUERY_UNSUPPORTED");}
      const contentType = request.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().includes("application/json")) {
        return errorResponse("INVALID_CATEGORY_CONTENT_TYPE", 415);
      }
      const declaredBytes = Number(request.headers.get("content-length") ?? "0");
      if (Number.isFinite(declaredBytes) && declaredBytes > MAX_BODY_BYTES) {
        return errorResponse("CATEGORY_REQUEST_TOO_LARGE", 413);
      }

      let rawText: string;
      try {
        rawText = await request.text();
      } catch {
        return errorResponse("INVALID_CATEGORY_QUERY");
      }
      if (new TextEncoder().encode(rawText).byteLength > MAX_BODY_BYTES) {
        return errorResponse("CATEGORY_REQUEST_TOO_LARGE", 413);
      }

      let raw: unknown;
      try {
        raw = JSON.parse(rawText);
      } catch {
        return errorResponse("INVALID_CATEGORY_QUERY");
      }

      const bound = bindCategoryAliasPayload(raw, config);
      if (!bound.ok) return errorResponse(bound.code);

      const headers = new Headers(request.headers);
      headers.delete("content-length");
      headers.set("content-type", "application/json");
      const canonicalRequest = new Request(checkoutUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(bound.payload),
      });
      return mainnetIntelligenceHandlers.POST({ request: canonicalRequest });
    },
  };
}
