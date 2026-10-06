import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const verifier = readFileSync("scripts/ops/verify-public-ask-production.mjs", "utf8");
const human = readFileSync("src/lib/ask-geomacro-core.server.ts", "utf8");
const machine = readFileSync("src/lib/testnet-intelligence-capability-hybrid.server.ts", "utf8");

describe("#1414 Ask Geomacro production acceptance", () => {
  it("probes all three canonical risk domains outside-in", () => {
    expect(verifier).toContain("Geopolitical Risk Index");
    expect(verifier).toContain("Macroeconomic Risk Index");
    expect(verifier).toContain("Critical Minerals Risk Index");
    expect(verifier).toContain("ASK_EXPECTED_DOMAIN_MISSING");
  });

  it("requires compact structured explanation and confidence boundaries", () => {
    for (const field of ["summary", "what_changed", "why_it_matters", "geomacro_view", "evidence"]) {
      expect(verifier).toContain(field);
    }
    expect(verifier).toContain("insufficient_evidence");
    expect(verifier).toContain("low_confidence");
    expect(verifier).toContain("source_identity_exposed");
    expect(verifier).toContain("durable_live_storage_write");
    expect(verifier).toContain("ASK_PRIVATE_SOURCE_LEAK");
  });

  it("keeps human and machine intelligence_query on the same canonical answer engine", () => {
    expect(human).toContain('import { answerAskQuestion } from "./ask-answer.server"');
    expect(human).toContain("answerAskQuestion(data.question)");
    expect(machine).toContain('import { answerAskQuestion } from "./ask-answer.server"');
    expect(machine).toContain('request.capability !== "intelligence_query"');
    expect(machine).toContain("answerAskQuestion(question)");
  });
});
