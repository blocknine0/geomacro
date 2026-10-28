import { describe, expect, it } from "vitest";
import { interpretMultilingualIntelligenceQuery as interpret } from "./multilingual-query-intent";

describe("multilingual no-funds query interpreter", () => {
  it.each([
    ["bn", "ভারতের মুদ্রাস্ফীতি ও বৈদেশিক মুদ্রার রিজার্ভ", "IND", ["macro_risk", "fx_external_risk"]],
    ["hi", "भारत की मुद्रास्फीति", "IND", ["macro_risk"]],
    ["ar", "التضخم في الهند", "IND", ["macro_risk"]],
    ["es", "inflación en India", "IND", ["macro_risk"]],
    ["fr", "inflation en Inde", "IND", ["macro_risk"]],
    ["de", "Inflation in Deutschland", "DEU", ["macro_risk"]],
    ["ru", "инфляция в России", "RUS", ["macro_risk"]],
    ["zh", "印度的通货膨胀", "IND", ["macro_risk"]],
    ["ja", "インドのインフレ", "IND", ["macro_risk"]],
    ["ko", "인도의 경제 성장", "IND", ["macro_risk"]],
    ["pt", "inflação no Brasil", "BRA", ["macro_risk"]],
  ])("classifies %s without paid access", (language,question,country,expectedTopics) => {
    const actual = interpret({question,language});
    expect(actual.subjects).toEqual([{type:"country",country_iso3:country}]);
    expect(actual.topics).toEqual(expect.arrayContaining(expectedTopics));
    expect(actual.query_plan_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(actual.evidence_checked).toBe(false);
    expect(actual.charged_now).toBe(false);
    expect(actual.payment_required_now).toBe(false);
    expect(actual.execution_authorized).toBe(false);
  });

  it("binds native Bengali/Hindi output to new quote hashes while retaining global input fallback",()=>{
    const q="ভারতের মুদ্রাস্ফীতি";
    const legacy=interpret({question:q});
    expect(legacy.canonical_request.response_locale).toBeUndefined();
    const native=interpret({question:q,language:"bn"});
    expect(native.canonical_request.response_locale).toBe("bn");
    expect(legacy.query_plan_hash).not.toBe(native.query_plan_hash);
    expect(native.output_locale).toBe("bn");
    expect(native.native_output_available).toBe(true);
    const english=interpret({question:q,language:"en"});
    expect(english.canonical_request.response_locale).toBe("en");
    expect(english.query_plan_hash).not.toBe(native.query_plan_hash);
    const hindi=interpret({question:"भारत की मुद्रास्फीति",language:"hi"});
    expect(hindi.canonical_request.response_locale).toBe("hi");
    const arabic=interpret({question:"التضخم في الهند",language:"ar"});
    expect(arabic.output_locale).toBe("en");
    expect(arabic.output_fallback_to_english).toBe(true);
    expect(arabic.canonical_request.response_locale).toBeUndefined();
  });
  it("preserves the exact same priced request and hash for repeated interpretation", () => {
    const input = {question:"ভারতের মুদ্রাস্ফীতি ও বৈদেশিক মুদ্রার রিজার্ভ"};
    const a = interpret(input);
    const b = interpret(input);
    expect(a.canonical_request).toEqual(b.canonical_request);
    expect(a.query_plan_hash).toBe(b.query_plan_hash);
    expect(a.selected_product).toEqual({capability:"intelligence_query",variant:"standard"});
    expect(a.indicative_catalog_price.amount_usdc).toBe("0.10");
  });

  it("infers directed Bengali corridors without confusing them with country comparisons", () => {
    const result = interpret({question:"ভারত থেকে বাংলাদেশে লিথিয়াম ও মুদ্রাস্ফীতির করিডোর প্রোফাইল"});
    expect(result.subjects).toEqual([{type:"corridor",origin_country_iso3:"IND",destination_country_iso3:"BGD"}]);
    expect(result.selected_product).toEqual({capability:"structural_corridor_profile",variant:"standard"});
    expect(result.indicative_catalog_price.amount_usdc).toBe("0.08");
  });

  it("routes an English comparison to complex intelligence without swapping entities", () => {
    const actual = interpret({question:"Compare India versus China on critical minerals"});
    expect(actual.intent).toBe("comparison");
    expect(actual.subjects).toEqual([
      {type:"country",country_iso3:"CHN"},
      {type:"country",country_iso3:"IND"},
    ]);
    expect(actual.selected_product).toEqual({capability:"intelligence_query",variant:"complex_multi_source"});
    expect(actual.indicative_catalog_price.amount_usdc).toBe("0.15");
  });

  it("selects an exact structural digest product for a bounded qualified dimension", () => {
    const d = interpret({question:"India lithium structural digest"});
    expect(d.selected_product).toEqual({capability:"structural_country_digest",variant:"standard"});
    expect(d.indicative_catalog_price.amount_usdc).toBe("0.02");
    expect(d.canonical_request.detail).toBe("compact");
    expect(d.canonical_request.delivery_tier).toBe("structural_baseline");
  });

  it("uses explicit ISO3 and topic enums as a global unknown-language fallback", () => {
    const out = interpret({
      question:"མི་མང་གི་གནས་ཚུལ་གསར་པ།",
      language:"bo",
      subjects:[{type:"country",country_iso3:"IND"}],
      topics:["macro_risk"],
    });
    expect(out.detected_language).toBe("bo");
    expect(out.subjects).toEqual([{type:"country",country_iso3:"IND"}]);
    expect(out.canonical_request.topics).toEqual(["macro_risk"]);
  });

  it("fails closed for ambiguous evidence, subjects, route direction and profile dimensions", () => {
    expect(()=>interpret({question:"Tell me something useful"})).toThrow("UNSUPPORTED_QUERY_TOPIC");
    expect(()=>interpret({question:"Inflation in an unknown country"})).toThrow("SUBJECT_REQUIRED");
    expect(()=>interpret({question:"India China lithium corridor digest"})).toThrow("CORRIDOR_DIRECTION_UNCLEAR");
    expect(()=>interpret({question:"India lithium structural profile"})).toThrow("PROFILE_REQUIRES_AT_LEAST_TWO_DIMENSIONS");
    expect(()=>interpret({question:"India latest news lithium digest"})).toThrow("STRUCTURAL_PRODUCT_CURRENT_NEWS_NOT_SUPPORTED");
  });

  it("rejects mismatches between explicitly selected subjects/topics and the question", () => {
    expect(()=>interpret({question:"India lithium",subjects:[{type:"country",country_iso3:"USA"}]}))
      .toThrow("EXPLICIT_SUBJECTS_CONTRADICT_QUESTION");
    expect(()=>interpret({question:"India inflation",
      topics:["critical_minerals"]})).toThrow("EXPLICIT_TOPICS_CONTRADICT_QUESTION");
  });

  it("requires explicit policy/action input for a Risk Gate, without creating a signature", () => {
    expect(()=>interpret({question:"Risk gate for India"})).toThrow("RISK_GATE_CONTEXT_REQUIRED");
    const out = interpret({question:"Risk gate for India",
      risk_gate_context:{action_type:"exposure_review",policy_preset:"balanced"}});
    expect(out.selected_product.capability).toBe("risk_gate_bundle");
    expect(out.evidence_checked).toBe(false);
  });

  it("never mislabels an unsupported historical or ranking request as an eligible sale", () => {
    expect(()=>interpret({question:"Rank by risk India versus China on inflation"}))
      .toThrow("AMBIGUOUS_QUERY_INTENT");
    expect(()=>interpret({question:"Inflation India",as_of:"2020-01-01T00:00:00Z"}))
      .toThrow("HISTORICAL_AS_OF_UNSUPPORTED_FOR_REQUESTED_MODULES");
  });
});
