import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

describe("#1827 minimum live source transport gate for 3-domain PRIVATE discovery",()=>{
  const flow=readFileSync(".github/workflows/global-realtime-source-proof.yml","utf8");
  const source=readFileSync("scripts/ops/probe-official-native-rss-three-domains.mjs","utf8");

  it("allows one publisher failure only if every domain has a fetched publisher lane",()=>{
    expect(flow).toContain('if [[ "$rc" == "3" ]] && jq -e');
    expect(flow).toContain('.all_three_categories_checked == true');
    expect(flow).toContain('(.categories | length) == 3');
    expect(flow).toContain('all(.fetch_ok == true and .commerce_eligible == false)');
    expect(flow).toContain('exit "$rc"');
    expect(source).toContain("SOURCE_POLL_DEGRADED");
    expect(source).toContain("publisher_transport_failure_domains");
  });
  it("never changes degraded receipt into full coverage, score readiness or chargeability",()=>{
    expect(flow).toContain('.status == "SOURCE_POLL_DEGRADED"');
    expect(flow).toContain('.proves_public_scored_intelligence == false');
    expect(flow).toContain('.public_published == false');
    expect(flow).toContain("PRIVATE discovery only.");
    expect(flow).not.toContain('SOURCE_POLL_DEGRADED" and .all_three_feeds_reached == true');
    expect(source).toContain("proves_public_scored_intelligence: false");
    expect(source).toContain("funds_touched: false");
    expect(source).toContain("commerce_eligible: false");
  });
});
