import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { STRUCTURED_TIER_REGISTRY } from "@/lib/structured-data-entitlement-registry";
import {
  TESTNET_ASSISTANCE_BOUNDARIES,
  TESTNET_STRUCTURAL_TEST_LIMITS,
} from "@/lib/testnet-data-delivery-contract";
import { TESTNET_INTELLIGENCE_CAPABILITIES } from "@/lib/testnet-intelligence-contract";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

const service = read("src/lib/testnet-intelligence-service.server.ts");
const assistive = read("src/lib/testnet-assistive-context.server.ts");
const capability = read("src/lib/testnet-intelligence-capability.server.ts");
const publicRoute = read("server/api/testnet-tester/intelligence.post.ts");
const developerRoute = read("server/api/testnet/intelligence.post.ts");

describe("Testnet data delivery alignment", () => {
  it("locks a bounded testing-only structural allowance", () => {
    expect(TESTNET_STRUCTURAL_TEST_LIMITS).toMatchObject({
      max_subjects_per_request: 1,
      digest_structural_observations: 3,
      profile_structural_observations: 8,
      max_evidence_references: 12,
      history_mode: "bounded_history",
      public_and_developer_same_allowance: true,
      bulk_export: false,
      execution_authorized: false,
    });

    const tier = STRUCTURED_TIER_REGISTRY.testnet_tester;
    expect(tier.max_subjects_per_request).toBe(TESTNET_STRUCTURAL_TEST_LIMITS.max_subjects_per_request);
    expect(tier.max_structural_observations).toBe(TESTNET_STRUCTURAL_TEST_LIMITS.profile_structural_observations);
    expect(tier.max_evidence_references).toBe(TESTNET_STRUCTURAL_TEST_LIMITS.max_evidence_references);
    expect(tier.history_mode).toBe(TESTNET_STRUCTURAL_TEST_LIMITS.history_mode);
  });

  it("keeps public-browser and developer credentials on the same canonical delivery service", () => {
    expect(publicRoute).toContain("deliverTestnetIntelligence({");
    expect(developerRoute).toContain("deliverTestnetIntelligence({");
    expect(publicRoute).toContain('access_surface: "testnet_tester"');
    expect(developerRoute).toContain('access_surface: "commercial_api"');
  });

  it("attaches common assistive context to every successful capability", () => {
    expect(TESTNET_INTELLIGENCE_CAPABILITIES).toHaveLength(8);
    expect(service).toContain("loadTestnetAssistiveContext(request)");
    expect(service).toContain("assistive_context: assistiveContext");
    expect(assistive).toContain('.from("live_structured_events")');
    expect(assistive).toContain("loadStructuralContext(subject)");
    expect(assistive).toContain("loadTestnetLiveSeverity(subject)");
    expect(assistive).toContain("included_in_primary_payload: true");
  });

  it("keeps delivery advisory rather than authorizing execution", () => {
    expect(TESTNET_ASSISTANCE_BOUNDARIES).toEqual({
      purpose: "decision_support_only",
      user_or_agent_controls_action: true,
      recommendation_is_not_execution_authority: true,
      execution_authorized: false,
    });
    expect(capability).toContain("execution_authorized: false");
    expect(service).toContain("execution_authorized: false");
  });
});
