import {readFileSync} from "node:fs";
import {describe,it,expect,vi} from "vitest";
import {unifiedThreeDomainSourceObservation} from "../lib/unified-three-domain-source-observation.server";

const now=new Date("2026-10-13T11:00:00.000Z");
function pulse({
  status="SOURCE_NATIVE_OBSERVED",
  at="2026-10-13T10:55:00.000Z",
}: {status?:string;at?:string}={}){
  const row={
    status,last_checked_at:at,publisher_pair_sample_complete:true,
    original_publishers_attempted:2,original_publishers_successful:2,
    original_publisher_topic_items_within_30m:3,
    private_source_id:"must-not-expose-geomacro",original_article_url:"https://some-origin.invalid/private",
  };
  return {schema:"geomacro.public-three-domain-source-pulse-30m.v1",
    chargeable:false,is_real_current_verified_intelligence:false,
    categories:{geopolitics:row,macro:{...row},rare_earth:{...row}}};
}
function fake(payload:unknown,ok=true){
  return vi.fn(async()=>({ok,json:async()=>payload})) as unknown as typeof fetch;
}
describe("unified status on canonical intelligence endpoint",()=>{
  it("reads the D1-backed source observation ONCE for all 3 domains, never provider identities",async()=>{
    const fetchImpl=fake(pulse());
    const out=await unifiedThreeDomainSourceObservation({fetchImpl,now});
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(Object.keys(out.categories).sort())
      .toEqual(["geopolitics","macro-fx","critical-minerals"].sort());
    expect(out.observed_category_count).toBe(3);
    expect(out.categories["macro-fx"].recent_original_topic_items).toBe(3);
    expect(out.chargeable).toBe(false);
    expect(out.x402_payment_authorized).toBe(false);
    expect(out.all_catalogued_sources_active_verified).toBe(false);
    expect(out.continuous_real_time_delivery_proven).toBe(false);
    for(const word of ["must-not-expose","some-origin.invalid","source_ref",
      "source_id","publisher_name","raw_article","API_KEY"]){
      expect(JSON.stringify(out)).not.toContain(word);
    }
  });
  it("returns degraded unknown statuses for 503, wrong schema, spoofed green or timeout",async()=>{
    for(const [payload,ok] of [
      [pulse(),false],
      [{...pulse(),schema:"forged"},true],
      [{...pulse(),chargeable:true},true],
      [{...pulse(),is_real_current_verified_intelligence:true},true],
    ] as const){
      const result=await unifiedThreeDomainSourceObservation({
        fetchImpl:fake(payload,ok),now});
      expect(result.observed_category_count).toBe(0);
      expect(result.all_catalogued_sources_active_verified).toBe(false);
      expect(result.chargeable).toBe(false);
    }
    const bad=await unifiedThreeDomainSourceObservation({
      fetchImpl:vi.fn(async()=>{throw Error("network refused")}) as unknown as typeof fetch,
      now});
    expect(bad.observed_category_count).toBe(0);
    expect(bad.categories.geopolitics.status).toBe("UNKNOWN_OR_NOT_YET_SYNCED");
  });
  it("refuses stale publisher clocks, incomplete pairs and missing category data",async()=>{
    const p=pulse({at:"2026-10-12T09:00:00.000Z"});
    p.categories.macro.original_publishers_successful=1;
    const out=await unifiedThreeDomainSourceObservation({fetchImpl:fake(p),now});
    expect(out.observed_category_count).toBe(0);
    expect(out.categories.geopolitics.status).toBe("STALE_OR_UNAVAILABLE");
    const current=pulse();
    current.categories.macro.original_publishers_successful=1;
    const partial=await unifiedThreeDomainSourceObservation({fetchImpl:fake(current),now});
    expect(partial.observed_category_count).toBe(2);
    expect(partial.categories["macro-fx"].publisher_pairs_sampled).toBe(false);
    expect(partial.categories["macro-fx"].recent_original_topic_items).toBeNull();
    expect(partial.categories.geopolitics.live_feed_event_verified).toBe(false);
  });
  it("only adds observational GET source view; existing canonical POST payment handler remains untouched",()=>{
    const route=readFileSync("src/routes/api.v1.intelligence.query.ts","utf8");
    expect(route).toContain("...mainnetIntelligenceHandlers");
    expect(route).toContain('url.searchParams.get("view")!=="source-status"');
    expect(route).toContain("unifiedThreeDomainSourceObservation()");
    expect(route).toContain("mainnetIntelligenceHandlers.GET({request})");
    expect(route).not.toContain("POST: async");
    expect(route).not.toContain("settleCoinbase");
    const source=readFileSync("src/lib/unified-three-domain-source-observation.server.ts","utf8");
    expect(source).toContain("all_catalogued_sources_active_verified:false");
    expect(source).toContain("original_article_content_delivered:false");
    expect(source).toContain("payment_required_now:false");
    expect(source).not.toContain("SOURCE_INTAKE_READ_TOKEN");
  });
});
