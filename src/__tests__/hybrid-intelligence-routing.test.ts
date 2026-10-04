import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("canonical hybrid intelligence routing", () => {
  it("routes public Ask Geomacro through the realtime-aware Ask orchestrator", () => {
    const ask = read("src/lib/ask-geomacro.functions.ts");
    const orchestrator = read("src/lib/ask-answer.server.ts");
    expect(ask).toContain('from "./ask-answer.server"');
    expect(ask).toContain("answerAskQuestion(data.question)");
    expect(orchestrator).toContain('from "./hybrid-ask-intelligence.server"');
    expect(orchestrator).toContain("answerHybridQuestion(question)");
    expect(orchestrator).toContain("realtimeSearchAnswer(question, primary)");
    expect(ask).not.toContain('answerQuestion, type AskAnswer } from "./ask-intelligence.server"');
  });

  it("routes paid/testnet intelligence_query through the same realtime-aware capability wrapper", () => {
    const service = read("src/lib/testnet-intelligence-service.server.ts");
    const capability = read("src/lib/testnet-intelligence-capability-hybrid.server.ts");

    expect(service).toContain('from "./testnet-intelligence-capability-hybrid.server"');
    expect(capability).toContain('request.capability !== "intelligence_query"');
    expect(capability).toContain('from "./ask-answer.server"');
    expect(capability).toContain('answerAskQuestion(question)');
    expect(capability).toContain('durable_live_storage_write: false');
    expect(capability).toContain('upstream_source_identity_exposed: false');
  });

  it("keeps live source identity and raw payloads out of the public runtime contract", () => {
    const runtime = read("global-intelligence/engine/intelligence-engine.mjs");
    expect(runtime).toContain('source_identity_exposed: false');
    expect(runtime).toContain('durable_live_storage_write: false');
    expect(runtime).toContain('Geomacro found these factors in real time based on your question.');
    expect(runtime).not.toContain('source_url: observation');
    expect(runtime).not.toContain('raw_payload: observation');
  });
});
