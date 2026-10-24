import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const verifier = readFileSync("scripts/ops/verify-public-ask-production.mjs", "utf8");
const human = readFileSync("src/lib/ask-geomacro-core.server.ts", "utf8");
const machine = readFileSync("src/lib/testnet-intelligence-capability-hybrid.server.ts", "utf8");
const orchestrator = readFileSync("src/lib/ask-answer.server.ts", "utf8");

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

  it("preserves honest no-current-signed-index response without false product readiness", () => {
    expect(verifier).toContain("HONEST_INDEX_UNAVAILABLE");
    expect(verifier).toContain("DEGRADED_CURRENT_INDEX_UNAVAILABLE");
    expect(verifier).toContain("current_signed_risk_indices_ready: indexesReady");
    expect(verifier).toContain("full_live_intelligence_acceptance: indexesReady");
    expect(verifier).toContain("data.gri === null");
    expect(verifier).toContain("ASK_VERIFIED_INDEX_NOT_ANSWERED_CONFIDENTLY");
  });

  it("answers three missing signed indices with their own exact domain names and no guessed score", () => {
    for (const label of ["Geopolitical Risk Index","Macroeconomic Risk Index","Critical Minerals Risk Index"]) {
      expect(orchestrator).toContain(label);
    }
    expect(orchestrator).toContain("canonicalScoredIndexQuestion(question)");
    expect(orchestrator).toContain("unavailableScoredIndex(scopedIndex)");
    expect(orchestrator).toContain("CURRENT_SIGNED_RISK_INDEX_UNAVAILABLE");
    expect(orchestrator).toContain("insufficient_evidence:true");
    expect(orchestrator).toContain("low_confidence:true,gri:null");
    expect(orchestrator).toContain("signed_gro_generated:false");
    expect(orchestrator).toContain("independent_same_event_verification:false");
  });

  it("keeps human and machine intelligence_query on the same canonical answer engine", () => {
    expect(human).toContain('import { answerAskQuestion } from "./ask-answer.server"');
    expect(human).toContain("answerAskQuestion(data.question)");
    expect(machine).toContain('import { answerAskQuestion } from "./ask-answer.server"');
    expect(machine).toContain('request.capability !== "intelligence_query"');
    expect(machine).toContain("answerAskQuestion(question)");
  });
});
