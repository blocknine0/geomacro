import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/050_structured_event_commercial_rights_sync.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("structured event commercial-rights synchronization", () => {
  it("derives stored event status only from the provenance evaluation view", () => {
    expect(migration).toContain(
      "from public.live_structured_event_commercial_rights_evaluation rights",
    );
    expect(migration).toContain(
      "commercial_eligibility_status = rights.evaluated_status",
    );
    expect(migration).toContain(
      "commercial_eligibility_reason_codes = rights.reason_codes",
    );
  });

  it("re-evaluates when evidence changes", () => {
    expect(migration).toContain(
      "after insert or update or delete",
    );
    expect(migration).toContain(
      "on public.live_structured_event_evidence",
    );
    expect(migration).toContain(
      "recompute_structured_event_commercial_eligibility",
    );
  });

  it("re-evaluates dependent events when reviewed source policy changes", () => {
    expect(migration).toContain(
      "after update of commercial_usage_status, commercial_terms_reference, commercial_reviewed_at",
    );
    expect(migration).toContain(
      "where m.source_key = new.source_key",
    );
  });

  it("keeps helper functions unavailable to public API roles", () => {
    expect(migration).toContain(
      "from public, anon, authenticated",
    );
    expect(migration).toContain(
      "to service_role",
    );
  });

  it("performs a one-time reconciliation for pre-trigger rows", () => {
    expect(migration).toContain(
      "One-time deterministic reconciliation",
    );
    expect(migration).toContain(
      "update public.live_structured_events ev",
    );
  });
});
