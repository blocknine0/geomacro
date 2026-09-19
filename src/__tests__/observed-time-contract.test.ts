import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("observed-time contract", () => {
  it("uses last_observed_at for current hot-topic and Federico candidate freshness", () => {
    const hotTopics = readFileSync(
      "src/lib/agent-query-hot-topics.server.ts",
      "utf8",
    );
    const publisher = readFileSync(
      "src/lib/country-risk-publisher.server.ts",
      "utf8",
    );
    const audit = readFileSync(
      "scripts/audit-agent-hot-topic-readiness.ts",
      "utf8",
    );
    const familyAudit = readFileSync(
      "scripts/audit-hot-topic-family-readiness.ts",
      "utf8",
    );
    const structure = readFileSync(
      "supabase/functions/live-structure-intelligence/index.ts",
      "utf8",
    );
    const migration = readFileSync(
      "supabase/migrations/958_live_structured_event_observed_time.sql",
      "utf8",
    );

    expect(migration).toContain(
      "last_observed_at timestamptz",
    );

    expect(structure).toContain(
      "last_observed_at:",
    );
    expect(structure).toContain(
      "manifest.period_end",
    );

    expect(hotTopics).toContain(
      '.gte("last_observed_at", cutoff)',
    );
    expect(hotTopics).toContain(
      '.order("last_observed_at", { ascending: false })',
    );

    expect(publisher).toContain(
      '.gte("last_observed_at", cutoff)',
    );
    expect(publisher).toContain(
      '.order("last_observed_at", { ascending: false })',
    );

    expect(audit).toContain(
      "last_observed_at",
    );
    expect(familyAudit).toContain(
      "last_observed_at",
    );
  });
});
