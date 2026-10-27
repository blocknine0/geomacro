import { describe, expect, it } from "vitest";
import {
  QUERY_DICTIONARY_LOCALES,
  resolveMultilingualQueryVocabulary,
} from "../lib/multilingual-query-dictionary";
import {
  inferAgentQueryIntent, inferAgentQueryTopics,
} from "../lib/agent-query-plan";

describe("global multilingual structured-query vocabulary", () => {
  it("builds regional names from 195 ISO countries and common locales", () => {
    expect(QUERY_DICTIONARY_LOCALES).toContain("bn");
    expect(QUERY_DICTIONARY_LOCALES).toContain("ar");
    const result = resolveMultilingualQueryVocabulary("India and Bangladesh GDP comparison");
    expect(result.countries).toEqual(["BGD", "IND"]);
    expect(result.indicators).toContain("GDP");
    expect(inferAgentQueryIntent("India and Bangladesh GDP comparison")).toBe("comparison");
  });

  it.each([
    ["বাংলাদেশের মুদ্রাস্ফীতি", "macro_risk"],
    ["भारत में मुद्रास्फीति", "macro_risk"],
    ["¿Cuál es la inflación en Argentina?", "macro_risk"],
    ["инфляция в России", "macro_risk"],
    ["中国通货膨胀", "macro_risk"],
    ["معدل التضخم في مصر", "macro_risk"],
    ["ভারতে বিনিময় হার", "fx_external_risk"],
    ["人民币汇率", "fx_external_risk"],
    ["日本の為替レート", "fx_external_risk"],
    ["印度的稀土产业", "critical_minerals"],
    ["俄罗斯对锂的需求", "critical_minerals"],
    ["भारत में सोना", "energy_commodities"],
    ["রূপার দাম", "energy_commodities"],
    ["سعر الذهب", "energy_commodities"],
  ])("routes %s to %s", (question, expected) => {
    expect(inferAgentQueryTopics(question)).toContain(expected);
  });

  it("produces structured commodity/currency entities without fuzzy substring routing", () => {
    const parsed = resolveMultilingualQueryVocabulary("भारत में सोना और USD विनिमय दर");
    expect(parsed.commodities).toContain("GOLD");
    expect(parsed.currencies).toContain("USD");
    expect(parsed.topics).toContain("fx_external_risk");
    expect(resolveMultilingualQueryVocabulary("Golden opportunity")).not.toMatchObject({
      commodities: ["GOLD"],
    });
  });

  it("recognizes multilingual intent but rejects multi-intent ambiguity", () => {
    expect(inferAgentQueryIntent("ভারত ও বাংলাদেশের তুলনা")).toBe("comparison");
    expect(inferAgentQueryIntent("中国和印度比较")).toBe("comparison");
    expect(() => inferAgentQueryIntent("ভারত তুলনা এবং ক্রমতালিকা")).toThrow("AMBIGUOUS_QUERY_INTENT");
  });

  it.each([
    ["Guinea-Bissau", ["GNB"]],
    ["Guinea–Bissau", ["GNB"]],
    ["Guinea — Bissau", ["GNB"]],
    ["Equatorial Guinea", ["GNQ"]],
    ["Papua New Guinea", ["PNG"]],
    ["South Sudan", ["SSD"]],
    ["Guinea-Bissau and Guinea", ["GIN", "GNB"]],
    ["South Sudan and Sudan", ["SDN", "SSD"]],
  ])("does not misattribute nested country names in %s", (question, countries) => {
    expect(resolveMultilingualQueryVocabulary(question).countries).toEqual(countries);
  });

  it("keeps the country mention list separate from price or risk qualification", () => {
    const result = resolveMultilingualQueryVocabulary("South Sudan and Guinea-Bissau inflation");
    expect(result.countries).toEqual(["GNB", "SSD"]);
    expect(result.topics).toContain("macro_risk");
    expect(Object.keys(result)).not.toContain("verified");
    expect(Object.keys(result)).not.toContain("commercial_eligible");
  });

  it("rejects oversized input and never mints a country from ambiguous text", () => {
    expect(() => resolveMultilingualQueryVocabulary("x".repeat(2001)))
      .toThrow("MULTILINGUAL_QUERY_LENGTH_INVALID");
    expect(resolveMultilingualQueryVocabulary("Congo")).toMatchObject({
      countries: [],
    });
  });
});
