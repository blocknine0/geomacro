import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/049_structured_event_source_rights_view.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("structured event source-rights evaluation", () => {
  it("keeps the source registry fail closed by default", () => {
    expect(migration).toContain(
      "commercial_usage_status text not null default 'REVIEW_REQUIRED'",
    );
    expect(migration).toContain("'INTERNAL_INHERIT_ONLY'");
  });

  it("records the reviewed GDELT dataset terms while retaining a derived-only boundary", () => {
    expect(migration).toContain("where source_key = 'gdelt_gal'");
    expect(migration).toContain(
      "commercial_usage_status = 'DERIVED_ONLY'",
    );
    expect(migration).toContain(
      "https://www.gdeltproject.org/about.html",
    );
    expect(migration).toContain(
      "raw publisher content is not a customer product",
    );
  });

  it("does not let the internal admitted-events handoff manufacture rights", () => {
    expect(migration).toContain(
      "commercial_usage_status = 'INTERNAL_INHERIT_ONLY'",
    );
    expect(migration).toContain(
      "where source_key = 'admitted_events'",
    );
  });

  it("derives event status through evidence fragment source identity", () => {
    expect(migration).toContain(
      "live_structured_event_commercial_rights_evaluation",
    );
    expect(migration).toContain(
      "join public.live_fragment_manifest m",
    );
    expect(migration).toContain(
      "left join public.live_source_registry r",
    );
    expect(migration).toContain(
      "when a.has_derived_only then 'DERIVED_ONLY'",
    );
    expect(migration).toContain(
      "when a.all_commercial_ok then 'VERIFIED'",
    );
  });

  it("keeps the rights view service-role only", () => {
    expect(migration).toContain(
      "revoke all on public.live_structured_event_commercial_rights_evaluation",
    );
    expect(migration).toContain("to service_role");
  });
});
