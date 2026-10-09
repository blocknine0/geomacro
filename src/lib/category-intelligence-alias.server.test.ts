import { describe, expect, it } from "vitest";
import { bindCategoryAliasPayload } from "./category-intelligence-alias.server";

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
