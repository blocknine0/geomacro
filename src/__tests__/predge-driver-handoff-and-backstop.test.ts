import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const from=(p:string)=>JSON.parse(readFileSync(p,"utf8"));
const base="docs/partners/predge/";
const schema=from("schemas/gro-1.1.schema.json");
const c=from(base+"gro-country-example.json"),cor=from(base+"gro-corridor-example.json");
const request=from(base+"risk-gate-request.json"),response=from(base+"risk-gate-response.json");
const manifest=from(base+"manifest.json");
describe("Predge 90-day no-funds integration handoff",()=>{
  it("has two complete canonical-shaped GRO fixtures, NOT production signed",()=>{
    for(const o of [c,cor]){
      for(const k of schema.required)expect(o).toHaveProperty(k);
      for(const k of schema.properties.integrity.required)expect(o.integrity).toHaveProperty(k);
      expect(o.schema_version).toBe("gro-1.1");
      expect(o.verification.status).toBe("INCOMPLETE");
      expect(o.commercial_eligibility.status).toBe("UNVERIFIED");
      expect(o.integrity.signature).toBeNull();
      expect(o.integrity.payload_hash).toBeNull();
      expect(Date.parse(o.expires_at)).toBeLessThan(Date.parse("2026-10-19T00:00:00Z"));
    }
    expect(c.subject.type).toBe("country");
    expect(cor.subject.type).toBe("corridor");
    expect(cor.corridor_context.origin_country_iso3).toBe("IND");
    expect(cor.corridor_context.destination_country_iso3).toBe("ARE");
  });
  it("matches real v1 Risk Gate policy fields and mandatory no-execution boundary",()=>{
    expect(request.request_id).toBe(response.request_id);
    expect(["country","corridor"]).toContain(request.subject.type);
    const p=request.policy;
    expect(p.continue_max_score).toBeLessThan(p.reduce_limit_max_score);
    expect(p.reduce_limit_max_score).toBeLessThan(p.require_approval_max_score);
    expect(p.require_commercial_verification_for_continue).toBe(true);
    expect(response.schema_version).toBe("risk-gate-1.0");
    expect(response.decision).toBe("PAUSE");
    expect(response.recommended_action).toBe("BLOCK");
    expect(response.execution_authorized).toBe(false);
    expect(response.risk.verification_status).toBe("INCOMPLETE");
    expect(manifest.execution_authorized).toBe(false);
    expect(manifest.production_gro_signed).toBe(false);
  });
  it("uses the same existing D1 journal for Predge and preserves external gating",()=>{
    const read=readFileSync(base+"README.md","utf8");
    const shared=readFileSync("workers/control-plane/src/shared-derived-news-feed.mjs","utf8");
    const index=readFileSync("workers/control-plane/src/index.mjs","utf8");
    expect(index).toContain("/v1/public/derived-structural-72h");
    expect(shared).toContain("SAME_D1_ROWS_AS_GEOMACRO_INTELLIGENCE");
    expect(read).toContain("commercial_derived_rights_verified:false");
    expect(read).toContain("100 checks/day");
    expect(read).toContain("500/day");
    expect(read).toContain("For the separately gated signed-market driver");
    expect(read).toContain("no per-item private approval receipt");
    expect(read).toContain("Neither quota nor credential is");
    expect(read).toContain("2 November 2026");
    expect(manifest.free_public_research_feed_requires_partner_scope_receipt).toBe(false);
    expect(manifest.free_public_research_feed_requires_rights_review_receipt).toBe(false);
    expect(manifest.free_public_research_feed_requires_approved_item_ids).toBe(false);
    expect(manifest.free_public_research_feed_requires_signed_gri).toBe(false);
    expect(manifest.internal_testing_and_validation_only).toBe(true);
    expect(manifest.resale_or_onward_redistribution_authorized).toBe(false);
    expect(manifest.unscored_observations_advisory_only).toBe(true);
    expect(manifest.predge_market_driver_accepted).toBe(false);
    expect(manifest.first_real_input_feedback_target_date).toBe("2026-11-02");
    expect(read).toContain("Predge must confirm");
    expect(read).toContain("execution_authorized:false");
  });
});
