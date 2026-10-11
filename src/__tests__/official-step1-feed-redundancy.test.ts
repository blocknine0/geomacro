import { describe, expect, it } from "vitest";
import { EXPANDED_OFFICIAL_SOURCES } from "../../scripts/ops/probe-expanded-official-source-mesh.mjs";
import { auditOfficialStep1Feeds } from "../../scripts/ops/audit-official-step1-feed-redundancy.mjs";

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
    expect(out.source_inventory_count).toBe(13);
    expect(out.source_transport_healthy_count).toBe(13);
    expect(out.per_category_two_independent_issuers_transport_healthy).toBe(true);
    expect(out.categories.map((r: any) => r.transport_healthy_independent_issuers)).toEqual([2, 2, 3]);
    expect(out.step1_end_to_end_accepted).toBe(false);
    expect(out.commercial_eligible).toBe(false);
    expect(out.country_article_relevance_and_rights_approved).toBe(false);
    expect(out.fresh_same_event_corroboration_approved).toBe(false);
  });

  it("preserves EITI 403 and two unavailable publishers but counts valid NRCan and Australia issuers", () => {
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
    expect(out.categories[2].transport_healthy_independent_issuers).toBe(2);
    expect(out.safe_source_failures.map((f: any) => f.http_status)).toEqual([403,null,null]);
    expect(out.safe_source_failures.every((f: any) => f.no_access_control_bypass)).toBe(true);
    expect(out.step1_end_to_end_accepted).toBe(false);
  });

  it("fails issuer floor if an independent alternate is not actually accessible", () => {
    const input = fixture();
    for (const id of ["nrcan_government_news_original_atom_review",
      "usgs_minerals_original_news_rss_review"]) {
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
});
