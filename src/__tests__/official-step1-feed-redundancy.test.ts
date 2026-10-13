import { describe, expect, it } from "vitest";
import { EXPANDED_OFFICIAL_SOURCES } from "../../scripts/ops/probe-expanded-official-source-mesh.mjs";
import { auditOfficialStep1Feeds } from "../../scripts/ops/audit-official-step1-feed-redundancy.mjs";
import { quarantinedOfficialSourceReceipt, QUARANTINED_OFFICIAL_SOURCE_ROUTES } from "../../scripts/lib/official-source-quarantine.mjs";

function fixture() {
  return {
    schema: "geomacro.expanded-official-source-observation.v1",
    observed_at: "2026-10-11T05:55:19.098Z",
    commercial_eligible: false, source_rights_verified: false,
    verified_country_count: 0,
    sources: EXPANDED_OFFICIAL_SOURCES.map((s: any) => ({
      source_id: s.id, domain: s.domain,
      format_valid: true, publisher_reachable: true,
      primary_http_status: 200, reason: "PRIVATE_SOURCE_TRANSPORT_ONLY",
      source_native_release_items: 3, source_native_24h_release_items: 0,
      original_publisher_topical_30m: s.original_hosts ? 0 : null,
      original_publisher_topical_90m: s.original_hosts ? 0 : null,
      original_publisher_topical_6h: s.original_hosts ? 0 : null,
      commercial_eligible: false, commercial_rights_verified: false,
      current_scored_intelligence_verified: false, country_coverage_verified: false,
    })),
  };
}

describe("#1827 Step-1 official first-party publisher source readiness", () => {
  it("requires two different issuing organizations per category; does not claim global freshness", () => {
    const out = auditOfficialStep1Feeds(fixture());
    expect(out.source_inventory_count).toBe(18);
    expect(out.source_transport_healthy_count).toBe(18);
    expect(out.per_category_two_independent_issuers_transport_healthy).toBe(true);
    expect(out.categories.map((r: any) => r.transport_healthy_independent_issuers)).toEqual([3, 4, 5]);
    expect(out.step1_end_to_end_accepted).toBe(false);
    expect(out.commercial_eligible).toBe(false);
    expect(out.country_article_relevance_and_rights_approved).toBe(false);
    expect(out.fresh_same_event_corroboration_approved).toBe(false);
  });

  it("counts only the audited same-UN-publisher HTTP 200 fallback, never a second issuer", () => {
    const good=fixture();
    const un=good.sources.find((x:any)=>x.source_id==="un_news_security_original_rss_review")!;
    (un as any).primary_http_status=null;
    (un as any).fallback_http_status=200;
    (un as any).official_same_publisher_fallback_attempted=true;
    (un as any).official_same_publisher_fallback_used=true;
    const accepted=auditOfficialStep1Feeds(good);
    expect(accepted.categories[0].transport_healthy_independent_issuers).toBe(3);
    expect(accepted.per_category_two_independent_issuers_transport_healthy).toBe(true);
    expect(accepted.current_signed_commercial_intelligence_verified).toBeUndefined();
    expect(accepted.commercial_eligible).toBe(false);
    for (const initialStatus of [401,403,429,200]) {
      un.primary_http_status=initialStatus;
      expect(()=>auditOfficialStep1Feeds(good)).toThrow("STEP1_SOURCE_RECEIPT_NOT_TRUSTED");
    }
    un.primary_http_status=503;
    expect(auditOfficialStep1Feeds(good).categories[0].transport_healthy_independent_issuers).toBe(3);
    (un as any).fallback_http_status=403;
    expect(()=>auditOfficialStep1Feeds(good)).toThrow("STEP1_SOURCE_RECEIPT_NOT_TRUSTED");
    (un as any).fallback_http_status=200;
    (un as any).official_same_publisher_fallback_attempted=false;
    expect(()=>auditOfficialStep1Feeds(good)).toThrow("STEP1_SOURCE_RECEIPT_NOT_TRUSTED");
    // An arbitrary publisher cannot forge a trusted alternate.
    const other=fixture();
    const fcdo=other.sources.find((x:any)=>x.source_id==="uk_fcdo_original_foreign_policy_atom_review")!;
    (fcdo as any).primary_http_status=null;
    (fcdo as any).fallback_http_status=200;
    (fcdo as any).official_same_publisher_fallback_attempted=true;
    (fcdo as any).official_same_publisher_fallback_used=true;
    expect(()=>auditOfficialStep1Feeds(other)).toThrow("STEP1_SOURCE_RECEIPT_NOT_TRUSTED");
  });

  it("preserves EITI 403 and unavailable USGS but counts independent NRCan, Australia and UK issuers", () => {
    const input = fixture();
    for (const [id, reason, status] of [
      ["eiti_implementing_country_official_api_review", "PUBLISHER_DENIED", 403],
      ["nrcan_simply_science_official_rss_review", "TRANSPORT_UNAVAILABLE", null],
      ["usgs_minerals_original_news_rss_review", "TRANSPORT_UNAVAILABLE", null],
    ] as const) {
      const row = input.sources.find((r: any) => r.source_id === id)!;
      row.format_valid = false;
      row.publisher_reachable = false;
      row.primary_http_status = status as number;
      row.reason = reason;
    }
    const out = auditOfficialStep1Feeds(input);
    expect(out.status).toBe("ORIGINAL_ISSUER_REDUNDANCY_OBSERVED_WITH_SOURCE_FAILURES");
    expect(out.source_transport_failed_count).toBe(3);
    expect(out.all_sources_working).toBe(false);
    expect(out.per_category_two_independent_issuers_transport_healthy).toBe(true);
    expect(out.categories[2].transport_healthy_independent_issuers).toBe(4);
    expect(out.safe_source_failures.map((f: any) => f.http_status)).toEqual([403,null,null]);
    expect(out.safe_source_failures.every((f: any) => f.no_access_control_bypass)).toBe(true);
    expect(out.step1_end_to_end_accepted).toBe(false);
  });

  it("fails issuer floor if an independent alternate is not actually accessible", () => {
    const input = fixture();
    for (const id of ["nrcan_government_news_original_atom_review",
      "usgs_minerals_original_news_rss_review",
      "uk_dbt_critical_minerals_atom_pending_review",
      "uk_desnz_original_energy_minerals_atom_review"]) {
      const row = input.sources.find((r: any) => r.source_id === id)!;
      row.format_valid = false; row.publisher_reachable = false;
      row.primary_http_status = 429;
      row.reason = "PUBLISHER_RATE_LIMITED";
    }
    const out = auditOfficialStep1Feeds(input);
    expect(out.status).toBe("ORIGINAL_ISSUER_REDUNDANCY_INSUFFICIENT");
    expect(out.categories[2].transport_healthy_independent_issuers).toBe(1);
    expect(out.per_category_two_independent_issuers_transport_healthy).toBe(false);
  });

  it("refuses source identity spoofing, fabricated dates, rights promotions and ambiguous receipt", () => {
    const mutate = [
      (x: any) => { x.sources[0].source_id = x.sources[1].source_id; },
      (x: any) => { x.sources[1].domain = "rare_earth"; },
      (x: any) => { x.sources[3].commercial_rights_verified = true; },
      (x: any) => { x.sources[0].format_valid = false; x.sources[0].publisher_reachable = false; },
      (x: any) => { x.sources[7].source_native_24h_release_items = 4; },
      (x: any) => { x.sources[7].original_publisher_topical_90m = 2; },
      (x: any) => { x.sources[7].primary_http_status = 403; },
      (x: any) => { x.commercial_eligible = true; },
      (x: any) => { x.verified_country_count = 195; },
    ];
    for (const patch of mutate) {
      const input = fixture();
      patch(input);
      if (input.sources[0].format_valid === false) {
        // Non-200/valid fake a genuine degraded source; keep visible.
        const out = auditOfficialStep1Feeds(input);
        expect(out.source_transport_failed_count).toBe(1);
        continue;
      }
      expect(() => auditOfficialStep1Feeds(input)).toThrow("STEP1_SOURCE_RECEIPT_NOT_TRUSTED");
    }
  });
  it("accepts an explicit historical quarantine without attempting a prohibited new request",()=>{
    const input=fixture();
    const ids=Object.keys(QUARANTINED_OFFICIAL_SOURCE_ROUTES);
    for(const id of ids){
      const source=EXPANDED_OFFICIAL_SOURCES.find(s=>s.id===id)!;
      const idx=input.sources.findIndex(x=>x.source_id===id);
      input.sources[idx]=quarantinedOfficialSourceReceipt(source) as any;
    }
    const out=auditOfficialStep1Feeds(input);
    expect(out.source_transport_live_failure_count).toBe(0);
    expect(out.source_transport_quarantined_not_polled_count).toBe(3);
    expect(out.source_transport_healthy_count).toBe(15);
    expect(out.status).toBe("ORIGINAL_ISSUER_REDUNDANCY_OBSERVED_WITH_QUARANTINE");
    expect(out.per_category_two_independent_issuers_transport_healthy).toBe(true);
    expect(out.all_sources_working).toBe(false);
    expect(out.safe_source_failures.map((row:any)=>row.reason))
      .toEqual(["QUARANTINED_NOT_POLLED","QUARANTINED_NOT_POLLED","QUARANTINED_NOT_POLLED"]);
    for(const fail of out.safe_source_failures){
      expect(fail.http_status).toBeNull();
      expect(fail.quarantined).toBe(true);
      expect(fail.no_access_control_bypass).toBe(true);
    }
    expect(out.step1_end_to_end_accepted).toBe(false);
    expect(out.commercial_eligible).toBe(false);
  });

  it("rejects falsely reporting denied HTTP 403 as a successful quarantine",()=>{
    const input=fixture();
    const idx=input.sources.findIndex(x=>x.source_id==="eiti_implementing_country_official_api_review");
    const src=EXPANDED_OFFICIAL_SOURCES.find(s=>s.id==="eiti_implementing_country_official_api_review")!;
    input.sources[idx]=quarantinedOfficialSourceReceipt(src) as any;
    input.sources[idx].primary_http_status=403;
    expect(()=>auditOfficialStep1Feeds(input)).toThrow("STEP1_SOURCE_RECEIPT_NOT_TRUSTED");
  });

});
