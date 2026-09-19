import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("permanent intelligence semantic contracts", () => {
  it("uses observation time for current availability while preserving publication chronology", () => {
    const structure = readFileSync(
      "supabase/functions/live-structure-intelligence/index.ts",
      "utf8",
    );
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
    const migration = readFileSync(
      "supabase/migrations/958_live_structured_event_observed_time.sql",
      "utf8",
    );

    expect(migration).toContain(
      "last_observed_at timestamptz",
    );
    expect(migration).toContain(
      "set last_observed_at = coalesce(last_observed_at, last_seen_at)",
    );

    expect(structure).toContain(
      "lastObservedAt: string",
    );
    expect(structure).toContain(
      "lastObservedAt:",
    );
    expect(structure).toContain(
      "manifest.period_end",
    );
    expect(structure).toContain(
      "last_observed_at:",
    );

    expect(hotTopics).toContain(
      '.gte("last_observed_at", cutoff)',
    );
    expect(hotTopics).toContain(
      '.order("last_observed_at", { ascending: false })',
    );

    expect(publisher).toContain(
      '"last_observed_at"',
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

  it("keeps live-structure runtime permanently self-contained", () => {
    const runtime = readFileSync(
      "supabase/functions/live-structure-intelligence/index.ts",
      "utf8",
    );
    const deploy = readFileSync(
      ".github/workflows/deploy-live-structure-intelligence.yml",
      "utf8",
    );

    expect(runtime).toContain(
      "phase =",
    );
    expect(runtime).toContain(
      "canonical_story_lookup",
    );
    expect(runtime).toContain(
      "throw canonicalStoryError;",
    );
    expect(runtime).not.toContain(
      "patch-live-structure-runtime",
    );

    expect(deploy).not.toContain(
      "patch-live-structure-runtime",
    );
    expect(deploy).not.toContain(
      "patch-live-structure-private-error-serializer",
    );
  });
});
