import { buildAgentQueryPlan, inferAgentQueryTopics, type AgentQueryTopic } from "./agent-query-plan";
import { mainnetIntelligenceHandlers } from "./mainnet-intelligence-endpoint.server";
import { publicIntelligenceSourceCoverage, type CommercialIntelligenceCategory } from "./public-intelligence-source-coverage";

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

  const payload = { ...body, topics: [...config.topics] };
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
      const response = await mainnetIntelligenceHandlers.GET({ request: canonicalGetRequest(request) });
      // Keep configuration failures and the actual payment environment intact.
      // Discovery describes this fixed scope; it is not evidence of fresh data.
      if (!response.ok) return response;
      const discovery = await response.json();
      return Response.json({
        ...discovery,
        endpoint: new URL(config.path ?? new URL(request.url).pathname, request.url).toString(),
        canonical_endpoint: new URL(CANONICAL_PATH, request.url).toString(),
        ...(config.category ? { category: config.category } : {}),
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
      const url = new URL(CANONICAL_PATH, request.url);
      const canonicalRequest = new Request(url, {
        method: "POST",
        headers,
        body: JSON.stringify(bound.payload),
      });
      return mainnetIntelligenceHandlers.POST({ request: canonicalRequest });
    },
  };
}
