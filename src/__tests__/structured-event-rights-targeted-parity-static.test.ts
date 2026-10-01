import fs from "node:fs";
import { describe, expect, it } from "vitest";

const canonical = fs.readFileSync(
  "supabase/migrations/051_internal_handoff_source_rights_resolution.sql",
  "utf8",
);
const targeted = fs.readFileSync(
  "supabase/migrations/20261001171057_sync_targeted_structured_event_rights_inheritance.sql",
  "utf8",
);

describe("targeted structured-event rights parity", () => {
  it("inherits INTERNAL_INHERIT_ONLY rights only through reviewed URL policy", () => {
    for (const marker of [
      "INTERNAL_INHERIT_ONLY",
      "live_source_url_commercial_policy",
      "lower(coalesce(e.source_domain, '')) = policy.source_domain",
      "lower(coalesce(e.source_url, '')) like lower(policy.url_prefix) || '%'",
      "policy.required_url_fragment is null",
      "coalesce(p.commercial_usage_status, 'REVIEW_REQUIRED')",
      "commercial_source_review_required",
    ]) {
      expect(canonical).toContain(marker);
      expect(targeted).toContain(marker);
    }
  });

  it("preserves bounded service-role-only targeted execution", () => {
    expect(targeted).toContain("cardinality(p_event_ids) > 500");
    expect(targeted).toContain("security definer");
    expect(targeted).toContain("set search_path = public");
    expect(targeted).toContain(
      "revoke all on function public.geomacro_structured_event_rights_snapshot(uuid[])",
    );
    expect(targeted).toContain("from public, anon, authenticated");
    expect(targeted).toContain("to service_role");
  });

  it("keeps archived-source provenance in the bounded path", () => {
    expect(targeted).toContain("live_structured_event_archived_sources");
    expect(targeted).toContain("archived_source_states");
    expect(targeted).toContain("then 'REVIEW_REQUIRED'");
  });
});
