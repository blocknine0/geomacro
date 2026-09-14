import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/916_risk_gate_v2_data_model.sql",
  "utf8",
);

describe("Risk Gate v2 data model", () => {
  it("creates the global subject, exposure and module-state foundation", () => {
    expect(migration).toContain("create table if not exists public.risk_subjects");
    expect(migration).toContain("create table if not exists public.risk_exposure_edges");
    expect(migration).toContain("create table if not exists public.risk_module_states");
    expect(migration).toContain("create table if not exists public.risk_module_attribution");
    expect(migration).toContain("'country','corridor','region','subnational','city','port','airport'");
    expect(migration).toContain("'chokepoint','logistics_route','energy_route'");
    expect(migration).toContain("'portfolio_exposure','event','custom_basket'");
  });

  it("includes broad persistent and emerging risk modules", () => {
    expect(migration).toContain("'geopolitical_security'");
    expect(migration).toContain("'geoeconomic_trade'");
    expect(migration).toContain("'currency_capital_mobility'");
    expect(migration).toContain("'supply_chain_logistics'");
    expect(migration).toContain("'infrastructure_cyber_technology'");
    expect(migration).toContain("'climate_environment_hazard'");
    expect(migration).toContain("'emerging_long_tail'");
  });

  it("keeps historical module state immutable", () => {
    expect(migration).toContain("prevent_risk_module_history_mutation");
    expect(migration).toContain("risk_module_states_immutable");
    expect(migration).toContain("risk_module_attribution_immutable");
    expect(migration).toContain("before update or delete on public.risk_module_states");
  });

  it("keeps the new tables server-side only", () => {
    expect(migration).toContain("alter table public.risk_subjects enable row level security");
    expect(migration).toContain("alter table public.risk_module_states enable row level security");
    expect(migration).toContain(
      "revoke all on table public.risk_subjects from PUBLIC, anon, authenticated",
    );
    expect(migration).toContain(
      "revoke all on table public.risk_module_states from PUBLIC, anon, authenticated",
    );
    expect(migration).toContain("grant all on table public.risk_module_states to service_role");
  });

  it("preserves explicit coverage, commercial eligibility and integrity fields", () => {
    expect(migration).toContain("coverage_state text not null");
    expect(migration).toContain("commercial_eligibility_status text not null");
    expect(migration).toContain("input_hash text not null");
    expect(migration).toContain("data_hash text not null");
    expect(migration).toContain("calculation_hash text not null");
  });
});
