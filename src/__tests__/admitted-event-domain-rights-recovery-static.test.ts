import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261001171000_restore_admitted_event_domain_rights.sql",
  "utf8",
);
const cleanup = readFileSync(
  "scripts/ops/b2-delete-structured-evidence-canary.mjs",
  "utf8",
);

describe("admitted-events publisher-domain rights recovery", () => {
  it("restores the reviewed live publisher-domain policy without making admitted_events itself commercial", () => {
    expect(migration).toContain("m.source_key = 'admitted_events'");
    expect(migration).toContain("'theguardian.com', 'guardian.com'");
    expect(migration).toContain("like '%.gdacs.org'");
    expect(migration).toContain("else 'DERIVED_ONLY'");
    expect(migration).toContain("geomacro_structured_event_source_states");
    expect(migration).toContain("live_source_url_commercial_policy");
  });

  it("keeps legacy archived admitted provenance fail closed", () => {
    expect(migration).toContain("add column if not exists source_domains text[]");
    expect(migration).toContain("Existing rows intentionally remain NULL");
    expect(migration).toContain("then 'REVIEW_REQUIRED'");
    expect(migration).toContain("legacy unknown archives remain review-gated");
    expect(migration).not.toMatch(/update\s+public\.live_structured_event_archived_sources\s+set\s+source_domains/i);
  });

  it("uses one correlated source-state resolver for both the view and bounded snapshot", () => {
    const resolverCalls = migration.match(/geomacro_structured_event_source_states\(/g) ?? [];
    expect(resolverCalls.length).toBeGreaterThanOrEqual(3);
    expect(migration).toContain("where e.event_id = p_event_id");
    expect(migration).toContain("where a.event_id = p_event_id");
    expect(migration).toContain("from public.geomacro_structured_event_source_states(ev.id) s");
    expect(migration).toContain("from public.geomacro_structured_event_source_states(req.requested_event_id) s");
  });

  it("preserves only compact domain provenance during verified B2 cleanup and rolls it back exactly", () => {
    expect(cleanup).toContain('select("event_id,source_key,source_domains,last_verified_at")');
    expect(cleanup).toContain('sourceKey === "admitted_events"');
    expect(cleanup).toContain("knownAdmittedDomain");
    expect(cleanup).toContain("source_domains: bridgeDomainsAfter");
    expect(cleanup).toContain("archived_source_domains:");
    expect(cleanup).toContain("STRUCTURED_EVIDENCE_DELETE_ROLLBACK_BRIDGE_RESTORE_FAILED");
    expect(cleanup).toContain("source_domains: bridgeDomainsBefore");
    expect(cleanup).not.toContain("storage.objects");
  });

  it("reconciles only events that still retain admitted-events evidence", () => {
    expect(migration).toContain("where m.source_key = 'admitted_events'");
    expect(migration).toContain("perform public.recompute_structured_event_commercial_eligibility(v_event_id)");
    expect(migration).not.toMatch(/update\s+public\.live_structured_events\s+ev\s+set/i);
  });
});
