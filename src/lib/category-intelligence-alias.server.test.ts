import { beforeEach, describe, expect, it, vi } from "vitest";

const mainnetHandlers = vi.hoisted(() => ({
  OPTIONS: vi.fn(),
  GET: vi.fn(),
  POST: vi.fn(),
}));

vi.mock("./mainnet-intelligence-endpoint.server", () => ({
  mainnetIntelligenceHandlers: mainnetHandlers,
}));

import {
  bindCategoryAliasPayload,
  createCategoryIntelligenceHandlers,
} from "./category-intelligence-alias.server";
import { classifyCentralSecurityRoute } from "./central-security.server";

const subject = { type: "country", country_iso3: "IND" as const };

const cases = [
  {
    name: "geopolitics",
    config: { topics: ["conflict_geopolitics"], requiredModules: ["geopolitical_security"] },
    question: "What geopolitical risks are relevant to India?",
  },
  {
    name: "macro and FX",
    config: {
      topics: ["macro_risk", "fx_external_risk"],
      requiredModules: ["external_fx", "macro_monetary", "sovereign_fiscal"],
    },
    question: "What macro and FX risks are relevant to India?",
  },
  {
    name: "critical minerals",
    config: { topics: ["critical_minerals"], requiredModules: ["critical_minerals"] },
    question: "What critical minerals risks are relevant to India?",
  },
] as const;

describe("fixed-scope category intelligence aliases", () => {
  it.each(cases)("binds $name to its exact topic and module set", ({ config, question }) => {
    const result = bindCategoryAliasPayload(
      { question, subjects: [subject], detail: "compact" },
      config,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.topics).toEqual(config.topics);
  });

  it.each(cases)("rejects a topic spoof on $name", ({ config }) => {
    const result = bindCategoryAliasPayload(
      { subjects: [subject], topics: ["risk_object"] },
      config,
    );
    expect(result).toEqual({ ok: false, code: "CATEGORY_TOPIC_SCOPE_MISMATCH" });
  });

  it.each(cases)("rejects a risk-object question on $name", ({ config }) => {
    const result = bindCategoryAliasPayload(
      { question: "Audit the signed risk object and provenance.", subjects: [subject] },
      config,
    );
    expect(result).toEqual({ ok: false, code: "CATEGORY_QUESTION_SCOPE_MISMATCH" });
  });

  it.each(cases)("rejects audit and risk-gate intent on $name", ({ config }) => {
    const audit = bindCategoryAliasPayload(
      { intent: "audit", subjects: [subject] },
      config,
    );
    const riskGate = bindCategoryAliasPayload(
      { intent: "risk_gate", subjects: [subject] },
      config,
    );
    expect(audit.ok).toBe(false);
    expect(riskGate.ok).toBe(false);
  });

  it.each(cases)("rejects non-country subjects on $name", ({ config }) => {
    const result = bindCategoryAliasPayload(
      {
        subjects: [{
          type: "corridor",
          origin_country_iso3: "IND",
          destination_country_iso3: "USA",
        }],
      },
      config,
    );
    expect(result).toEqual({ ok: false, code: "CATEGORY_COUNTRY_SUBJECTS_ONLY" });
  });

  it("rejects malformed and empty payloads before payment", () => {
    const config = cases[0].config;
    expect(bindCategoryAliasPayload(null, config)).toEqual({
      ok: false,
      code: "INVALID_CATEGORY_QUERY",
    });
    expect(bindCategoryAliasPayload({ topics: ["conflict_geopolitics"] }, config)).toEqual({
      ok: false,
      code: "CATEGORY_SUBJECT_REQUIRED",
    });
  });

  it("accepts the exact fixed topic set independent of caller ordering", () => {
    const result = bindCategoryAliasPayload(
      {
        subjects: [subject],
        topics: ["fx_external_risk", "macro_risk"],
      },
      cases[1].config,
    );
    expect(result.ok).toBe(true);
  });
});

describe("category intelligence security routing", () => {
  it.each([
    "/api/v1/intelligence/geopolitics",
    "/api/v1/intelligence/macro-fx",
    "/api/v1/intelligence/critical-minerals",
  ])("classifies %s as payment protected", (pathname) => {
    expect(classifyCentralSecurityRoute(pathname, "POST")).toBe("payment");
    expect(classifyCentralSecurityRoute(pathname, "GET")).toBe("payment");
  });
});

describe("category intelligence HTTP handler boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it.each(cases)("forwards the $name query to the canonical handler with payment signature intact", async ({ config, question }) => {
    const delivered = Response.json({ ok: true, chargeable: false, payment_required_now: false });
    mainnetHandlers.POST.mockResolvedValue(delivered);
    const handlers = createCategoryIntelligenceHandlers(config);
    const request = new Request("https://geomacro.live/api/v1/intelligence/geopolitics", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "payment-signature": "signed-request-token",
        "x-request-id": "request-123",
      },
      body: JSON.stringify({ question, subjects: [subject], detail: "compact" }),
    });

    const response = await handlers.POST({ request });
    expect(response).toBe(delivered);
    expect(mainnetHandlers.POST).toHaveBeenCalledTimes(1);
    const forwarded = mainnetHandlers.POST.mock.calls[0]?.[0]?.request as Request;
    expect(forwarded.url).toBe("https://geomacro.live/api/v1/intelligence/query");
    expect(forwarded.headers.get("payment-signature")).toBe("signed-request-token");
    expect(forwarded.headers.get("x-request-id")).toBe("request-123");
    expect(forwarded.headers.get("content-type")).toBe("application/json");
    expect(await forwarded.json()).toMatchObject({ question, subjects: [subject], topics: config.topics });
  });

  it("rejects invalid scope before invoking the payment handler", async () => {
    const handlers = createCategoryIntelligenceHandlers(cases[0].config);
    const request = new Request("https://geomacro.live/api/v1/intelligence/geopolitics", {
      method: "POST",
      headers: { "content-type": "application/json", "payment-signature": "must-not-be-verified" },
      body: JSON.stringify({ subjects: [subject], topics: ["risk_object"] }),
    });

    const response = await handlers.POST({ request });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      chargeable: false,
      payment_required_now: false,
      execution_authorized: false,
      error: { code: "CATEGORY_TOPIC_SCOPE_MISMATCH" },
    });
    expect(mainnetHandlers.POST).not.toHaveBeenCalled();
  });

  it("rejects an oversized declared body before parsing or invoking the payment handler", async () => {
    const handlers = createCategoryIntelligenceHandlers(cases[0].config);
    const request = new Request("https://geomacro.live/api/v1/intelligence/geopolitics", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "40000" },
      body: JSON.stringify({ subjects: [subject] }),
    });

    const response = await handlers.POST({ request });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      chargeable: false,
      payment_required_now: false,
      error: { code: "CATEGORY_REQUEST_TOO_LARGE" },
    });
    expect(mainnetHandlers.POST).not.toHaveBeenCalled();
  });
});
