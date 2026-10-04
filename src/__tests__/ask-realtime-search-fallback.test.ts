import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Ask Geomacro realtime search fallback", () => {
  it("runs current public search only after the primary intelligence answer is insufficient", () => {
    const orchestrator = read("src/lib/ask-answer.server.ts");
    expect(orchestrator).toContain("answerHybridQuestion(question)");
    expect(orchestrator).toContain("if (!primary.insufficient_evidence) return primary");
    expect(orchestrator).toContain("realtimeSearchAnswer(question, primary)");
    expect(orchestrator).toContain("return realtime ?? primary");
  });

  it("uses a bounded current-web path with broad three-domain coverage", () => {
    const fallback = read("src/lib/ask-realtime-search.server.ts");
    expect(fallback).toContain("api.gdeltproject.org/api/v2/doc/doc");
    expect(fallback).toContain('timespan:');
    expect(fallback).toContain('category: "GEOPOLITICS"');
    expect(fallback).toContain('category: "MACRO"');
    expect(fallback).toContain('category: "CRITICAL_MINERALS"');
    expect(fallback).toContain("Promise.allSettled");
    expect(fallback).toContain("SEARCH_TIMEOUT_MS = 7_000");
  });

  it("keeps realtime answers structured even when the optional grounded formatter is unavailable", () => {
    const fallback = read("src/lib/ask-realtime-search.server.ts");
    expect(fallback).toContain("groqClassifyJson");
    expect(fallback).toContain("deterministicStructuredAnswer");
    expect(fallback).toContain('`${index + 1}) ${hit.title}`');
    expect(fallback).toContain("using deterministic structure");
  });

  it("never exposes raw realtime URLs or provider identity in the public Ask answer", () => {
    const fallback = read("src/lib/ask-realtime-search.server.ts");
    expect(fallback).toContain('source_identity_exposed: false');
    expect(fallback).toContain('durable_live_storage_write: false');
    expect(fallback).toContain('eventId: fallbackId');
    expect(fallback).not.toContain('sourceUrl:');
    expect(fallback).not.toContain('url: hits[index]');
  });

  it("routes both public Ask transports through the same realtime-aware answer orchestrator", () => {
    const core = read("src/lib/ask-geomacro-core.server.ts");
    const serverFn = read("src/lib/ask-geomacro.functions.ts");
    for (const source of [core, serverFn]) {
      expect(source).toContain('from "./ask-answer.server"');
      expect(source).toContain("answerAskQuestion(data.question)");
      expect(source).toContain("toCommercialAskBrief");
    }
  });
});
