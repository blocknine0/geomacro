import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";

describe("representative real source acceptance",()=>{
  const probe=readFileSync("scripts/ops/verify-live-on-demand-representative-cases.ts","utf8");
  const workflow=readFileSync(".github/workflows/live-on-demand-source-acceptance.yml","utf8");
  it("uses three distinct current-window single-category tests and a cross-domain recent-window query",()=>{
    for(const id of ["RUS_GEO_24H","GBR_FX_24H","USA_DOE_MINERALS_24H","GBR_CROSS_DOMAIN_7D"])
      expect(probe).toContain(id);
    expect(probe).toContain('time_class:"CURRENT_24H"');
    expect(probe).toContain('time_class:"RECENT_7D"');
    expect(probe).toContain('categories:["geopolitics","macro","rare_earth"]');
    expect(probe).toContain('max_age_seconds:86_400');
    expect(probe).toContain("NO_RELEVANT_ORIGINAL_IN_REQUESTED_WINDOW");
    expect(probe).toContain('{id:"USA_DOE_MINERALS_24H",country_iso3:"USA"');
    expect(probe).toContain("ORIGINAL_DATE_QUALIFIED_REVIEW_PENDING");
  });
  it("runs genuinely read-only in both PR and protected-main scopes",()=>{
    expect(workflow.split("bun scripts/ops/verify-live-on-demand-representative-cases.ts"))
      .toHaveLength(3);
    expect(workflow.split("artifacts/on-demand-live/representative-source-cases.json"))
      .toHaveLength(3);
    expect(probe).toContain("strict_max_requests_per_case:16");
    expect(probe).toContain('disableDiscoveryIndex:sample.time_class==="CURRENT_24H"');
    expect(probe).toContain("allNetwork>64");
    expect(probe).toContain("result.discovery.network_attempts>12");
    expect(probe).toContain("page.attempted>4");
    expect(probe).toContain("qualified.commercial_delivery_eligible!==false");
    expect(probe).toContain("raw_source_content_exported:false");
    expect(probe).toContain("signed_customer_answers:0");
    expect(probe).toContain("payment_offers_created:0,settlements:0");
  });
});
