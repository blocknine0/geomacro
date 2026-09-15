import fs from "node:fs";
import { describe, expect, it } from "vitest";

const loader = fs.readFileSync("src/lib/agent-query-hot-topics.server.ts", "utf8");
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

  it("fails closed when current signals exist but none are commercially deliverable", () => {
    expect(loader).toContain('HOT_TOPIC_COMMERCIAL_COVERAGE_INSUFFICIENT');
    expect(loader).toContain('matching.length > 0 && eligible.length === 0');
  });

  it("keeps a healthy no-signal result distinct from zero risk", () => {
    expect(loader).toContain('current_event_signal: matching.length > 0');
    expect(loader).toContain('no_signal_is_not_zero_risk: true');
  });

  it("routes hot_topics through the dedicated governed checker and response layer", () => {
    expect(deliverability).toContain('"hot_topics"');
    expect(external).toContain('input.module === "hot_topics"');
    expect(external).toContain('loadAgentHotTopics');
    expect(response).toContain('loadAgentHotTopics');
    expect(response).toContain('hot_topics: hotTopics');
    expect(response).toContain('current_event_raw_source_material_redistributed: false');
  });
});
