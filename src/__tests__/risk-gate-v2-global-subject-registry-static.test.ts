import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/917_risk_gate_v2_global_subject_registry.sql",
  "utf8",
);

describe("Risk Gate v2 global subject registry", () => {
  it("reuses the canonical country registry instead of introducing a second country list", () => {
    expect(migration).toContain("from public.live_country_registry as registry");
    expect(migration).toContain("'country:' || registry.iso3");
    expect(migration).toContain("registry.country_name");
    expect(migration).toContain("registry.enabled");
  });

  it("does not confuse subject existence with validated risk coverage", () => {
    expect(migration).toContain("'INSUFFICIENT'");
    expect(migration).toContain("registry presence is NOT risk coverage");
  });

  it("creates directional corridors on demand from enabled ISO3 countries", () => {
    expect(migration).toContain("ensure_risk_gate_corridor_subject");
    expect(migration).toContain("origin_iso3 || '>' || destination_iso3");
    expect(migration).toContain("'corridor_origin'");
    expect(migration).toContain("'corridor_destination'");
    expect(migration).toContain("corridor origin and destination must be different");
  });

  it("fails closed for countries outside the enabled canonical registry", () => {
    expect(migration).toContain("origin country is not enabled in the canonical country registry");
    expect(migration).toContain("destination country is not enabled in the canonical country registry");
  });

  it("keeps registry mutation helpers server-only", () => {
    expect(migration).toContain(
      "on function public.ensure_risk_gate_corridor_subject(text, text)\nfrom PUBLIC, anon, authenticated",
    );
    expect(migration).toContain(
      "on function public.sync_risk_gate_country_subject()\nfrom PUBLIC, anon, authenticated",
    );
    expect(migration).toContain("to service_role");
  });
});
