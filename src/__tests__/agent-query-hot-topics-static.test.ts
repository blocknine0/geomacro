import fs from "node:fs";
import { describe, expect, it } from "vitest";

const loader = fs.readFileSync("src/lib/agent-query-hot-topics.server.ts", "utf8");
const taxonomy = fs.readFileSync("src/lib/hot-topic-taxonomy.ts", "utf8");
const familyAudit = fs.readFileSync("scripts/audit-hot-topic-family-readiness.ts", "utf8");
const deliverability = fs.readFileSync("src/lib/agent-query-deliverability.server.ts", "utf8");
const external = fs.readFileSync("src/lib/agent-query-external-modules.server.ts", "utf8");
const response = fs.readFileSync("src/lib/agent-query-response.server.ts", "utf8");

describe("adaptive hot-topic commercial delivery", () => {
  it("requires a registered subject and healthy fresh live pipeline", () => {
    expect(loader).toContain('from("live_country_registry")');
    expect(loader).toContain('from("live_ingestion_cursors")');
    expect(loader).toContain('HOT_TOPIC_PIPELINE_MAX_LAG_SECONDS = 30 * 60');
    expect(loader).toContain('cursor.data.status !== "healthy"');
    expect(loader).toContain('HOT_TOPIC_PIPELINE_UNHEALTHY');
    expect(loader).toContain('HOT_TOPIC_PIPELINE_STALE');
  });

  it("serves only governed structured current-event intelligence", () => {
    expect(loader).toContain('from("live_structured_events")');
    expect(loader).toContain('new Set(["VERIFIED", "DERIVED_ONLY"])');
    expect(loader).toContain('STRUCTURED_DERIVED_INTELLIGENCE_ONLY');
    expect(loader).toContain('raw_source_material_redistributed: false');
    expect(loader).toContain('article_text_redistributed: false');
    expect(loader).not.toContain("evidence_refs");
    expect(loader).not.toContain("source_url");
  });

  it("uses a versioned governed family taxonomy for question-specific filtering", () => {
    expect(taxonomy).toContain('HOT_TOPIC_TAXONOMY_VERSION = "geomacro.hot-topic-family.v1"');
    expect(taxonomy).toContain('"military_conflict"');
    expect(taxonomy).toContain('"sanctions_export_controls"');
    expect(taxonomy).toContain('"shipping_chokepoints"');
    expect(taxonomy).toContain('"natural_hazards"');
    expect(taxonomy).toContain('"banking_financial_system"');
    expect(loader).toContain('inferHotTopicFamiliesFromQuestion(input.plan.question_key)');
    expect(loader).toContain('intersectsRequestedFamilies');
    expect(loader).toContain('requested_families: requestedFamilies');
    expect(loader).toContain('matched_families: matchedFamilies');
    expect(loader).toContain('families: rowFamilies(row)');
  });

  it("fails closed when current signals exist but none are commercially deliverable", () => {
    expect(loader).toContain('HOT_TOPIC_COMMERCIAL_COVERAGE_INSUFFICIENT');
    expect(loader).toContain('matching.length > 0 && eligible.length === 0');
  });

  it("keeps a healthy no-signal result distinct from zero risk", () => {
    expect(loader).toContain('current_event_signal: canonicalRows.length > 0');
    expect(loader).toContain('no_signal_is_not_zero_risk: true');
    expect(loader).toContain('unclassified_events_excluded_from_family_specific_results: true');
  });

  it("audits every governed family without converting no-signal into support evidence", () => {
    expect(familyAudit).toContain('HOT_TOPIC_FAMILIES.map');
    expect(familyAudit).toContain('CAPABILITY_READY_NO_CURRENT_SIGNAL');
    expect(familyAudit).toContain('CURRENT_SIGNAL_BLOCKED_COMMERCIAL_RIGHTS');
    expect(familyAudit).toContain('blocked_rights_current_signal_is_not_chargeable_for_that_family: true');
    expect(familyAudit).toContain('this_audit_does_not_claim_all_world_events_are_observed: true');
    expect(familyAudit).toContain('writes_performed: false');
  });

  it("routes hot_topics through the dedicated governed checker and response layer", () => {
    expect(deliverability).toContain('"hot_topics"');
    expect(external).toContain('input.module === "hot_topics"');
    expect(external).toContain('loadAgentHotTopics');
    expect(response).toContain('loadAgentHotTopics');
    expect(response).toContain('events: result.events.map((event) =>');
    expect(response).toContain('publicStructuralDevelopment');
  });
});
