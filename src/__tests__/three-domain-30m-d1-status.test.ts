import {describe,expect,it,vi} from "vitest";
import {readFileSync} from "node:fs";
import {projectSourcePulseForD1,write30MinSourcePulseToD1} from "../../scripts/ops/write-30min-source-pulse-d1.mjs";
import {projectPublic30mPulse} from "../../workers/control-plane/src/source-pulse-public.mjs";
import {categoryOriginalSourcePulse} from "../lib/current-30min-original-source-pulse.server";

const at="2026-10-10T16:55:18.010Z";
const now=new Date("2026-10-10T17:00:00.000Z");
const domains=["geopolitics","macro","rare_earth"];
function report(counts=[0,1,2],degraded:string|null=null) {
  return {
    schema:"geomacro.private-three-domain-source-pulse-30m.v1",
    observed_at:at,target_poll_minutes:30,
    source_catalog_entries_are_not_events:true,
    independently_verified_current_intelligence_count:0,
    publisher_rights_verified:false,
    b2_reads:0,b2_writes:0,d1_writes:0,supabase_requests:0,payments_performed:0,
    actual_original_publisher_rows:domains.map((domain,i)=>({
      domain,checked_at:at,
      status:degraded===domain?"SOURCE_TRANSPORT_DEGRADED":"ORIGINAL_PUBLISHER_DATE_OBSERVED",
      original_publisher_30m_topic_count:degraded===domain?null:counts[i],
      publisher_pair_sample_complete:degraded!==domain,
      original_publishers_attempted:degraded===domain?1:2,
      original_publishers_successful:degraded===domain?0:2,
      chargeable_intelligence_ready:false,signed_current_gro_verified:false,
      commercial_rights_verified:false,
    })),
  };
}
function storedRows(rows:ReturnType<typeof projectSourcePulseForD1>) {
  return rows.map(row=>({
    scope:row.domain,status:row.status,last_attempt_at:row.checked_at,
    metadata_json:JSON.stringify(row.metadata),
  }));
}

describe("#1827 30m pulse D1 -> public API safe status (not GRO)",()=>{
  it("writes three compact domain checkpoints without historical score promotion",()=>{
    const rows=projectSourcePulseForD1(report());
    expect(rows).toHaveLength(3);
    expect(rows.map(x=>x.status)).toEqual(["OBSERVED","OBSERVED","OBSERVED"]);
    expect(rows.map(x=>x.metadata.original_publisher_30m_topic_count)).toEqual([0,1,2]);
    expect(rows.every(x=>x.metadata.commercial_eligible===false)).toBe(true);
    const publicReport=projectPublic30mPulse(storedRows(rows),now);
    expect(publicReport.schema).toBe("geomacro.public-three-domain-source-pulse-30m.v1");
    expect(publicReport.categories.geopolitics.original_publisher_topic_items_within_30m).toBe(0);
    expect(publicReport.categories.macro.original_publisher_topic_items_within_30m).toBe(1);
    expect(publicReport.categories.rare_earth.original_publisher_topic_items_within_30m).toBe(2);
    expect(publicReport.categories.geopolitics.no_new_original_topic_item_observed).toBe(true);
    expect(publicReport.is_real_current_verified_intelligence).toBe(false);
    expect(publicReport.chargeable).toBe(false);
  });

  it("fails closed on missing/stale/future D1 original source proof",()=>{
    const rows=projectSourcePulseForD1(report());
    const base=storedRows(rows);
    const miss=projectPublic30mPulse(base.filter(x=>x.scope!=="macro"),now);
    expect(miss.categories.macro.status).toBe("UNKNOWN_NOT_YET_CHECKED");
    const stale=projectPublic30mPulse(base,new Date("2026-10-10T19:00:00.000Z"));
    expect(stale.categories.geopolitics.status).toBe("STALE_OR_UNAVAILABLE");
    expect(stale.categories.geopolitics.original_publisher_topic_items_within_30m).toBeNull();
    const future=projectPublic30mPulse(base,new Date("2026-10-10T16:00:00.000Z"));
    expect(future.categories.macro.status).toBe("STALE_OR_UNAVAILABLE");
  });

  it("does not turn partial source monitoring into a false whole-category no-news result",()=>{
    const input=report([0,0,0]);
    input.actual_original_publisher_rows[0].publisher_pair_sample_complete=false;
    input.actual_original_publisher_rows[0].original_publishers_successful=1;
    const records=storedRows(projectSourcePulseForD1(input));
    const result=projectPublic30mPulse(records,now);
    expect(result.categories.geopolitics.status).toBe("SOURCE_NATIVE_OBSERVED");
    expect(result.categories.geopolitics.original_publisher_topic_items_within_30m).toBe(0);
    expect(result.categories.geopolitics.publisher_pair_sample_complete).toBe(false);
    expect(result.categories.geopolitics.no_new_original_topic_item_observed).toBe(false);
    expect(result.categories.macro.no_new_original_topic_item_observed).toBe(true);
  });

  it("never changes DEGRADE into healthy or 0 observed articles",()=>{
    const rows=projectSourcePulseForD1(report([0,1,0],"rare_earth"));
    const result=projectPublic30mPulse(storedRows(rows),now);
    expect(result.categories.rare_earth.status).toBe("SOURCE_TRANSPORT_DEGRADED");
    expect(result.categories.rare_earth.original_publisher_topic_items_within_30m).toBeNull();
    expect(result.categories.rare_earth.no_new_original_topic_item_observed).toBe(false);
    expect(rows[2].last_success_at).toBeNull();
  });

  it("rejects forged current count, missing domain, duplicate D1 and invalid status",()=>{
    const bad=report();bad.actual_original_publisher_rows[0].original_publisher_30m_topic_count=9999;
    expect(()=>projectSourcePulseForD1(bad)).toThrow();
    const missing=report();missing.actual_original_publisher_rows.pop();
    expect(()=>projectSourcePulseForD1(missing)).toThrow();
    const rows=storedRows(projectSourcePulseForD1(report()));
    expect(()=>projectPublic30mPulse([...rows,rows[0]],now)).toThrow();
    rows[0].metadata_json=JSON.stringify({
      ...JSON.parse(rows[0].metadata_json),commercial_eligible:true,
    });
    const result=projectPublic30mPulse(rows,now);
    expect(result.categories.geopolitics.status).toBe("SOURCE_TRANSPORT_DEGRADED");
  });

  it("persists and independently reads back all three scopes with injected in-memory D1 client",async()=>{
    const map=new Map<string,any>();
    const persist=vi.fn(async(domain:string,state:any,update:any)=>{
      map.set(domain,{
        last_attempt_at:update.last_attempt_at,
        // This precisely matches createD1ControlPlaneStateClient.loadRows:
        // returned cursor lives inside payload, NOT at the top-level.
        payload:{...state,...update.payload,cursor:state.cursor},
      });
    });
    const result=await write30MinSourcePulseToD1({
      report:report(),
      fetchImpl:async()=>new Response(JSON.stringify({
        success:true,result:[{name:"geomacro-control-plane",uuid:"12345678-1234-1234-1234-123456789abc"}],
      }),{status:200}),
      createClient:()=>({persist,loadRows:async()=>map}),
    });
    expect(persist).toHaveBeenCalledTimes(3);
    expect(map.get("geopolitics").cursor).toBeUndefined();
    expect(map.get("geopolitics").payload.cursor.status).toBe("OBSERVED");
    expect(result.d1_readback_verified).toBe(true);
    expect(result.source_current_scored_intelligence_verified).toBe(false);
    expect(result.b2_requests).toBe(0);
    expect(result.supabase_requests).toBe(0);
    expect(result.payment_performed).toBe(false);
  });

  it("offers honest 30m publisher-status counts in three category discovery GETs, never a paid result",async()=>{
    const rows=projectPublic30mPulse(storedRows(projectSourcePulseForD1(report([0,1,2]))),now);
    const fake=async()=>new Response(JSON.stringify(rows),{status:200,headers:{"content-type":"application/json"}});
    const byGeo=await categoryOriginalSourcePulse("geopolitics",{fetchImpl:fake as typeof fetch,now:1000});
    expect(byGeo.observation.publisher_topic_items_in_last_30m).toBe(0);
    expect(byGeo.observation.no_new_relevant_original_item_observed).toBe(true);
    expect(byGeo.current_signed_risk_intelligence_verified).toBe(false);
    expect(byGeo.paid_availability_proven).toBe(false);
    const byMacro=await categoryOriginalSourcePulse("macro-fx",{fetchImpl:fake as typeof fetch,now:1000});
    expect(byMacro.observation.publisher_topic_items_in_last_30m).toBe(1);
    const byMinerals=await categoryOriginalSourcePulse("critical-minerals",{fetchImpl:fake as typeof fetch,now:1000});
    expect(byMinerals.observation.publisher_topic_items_in_last_30m).toBe(2);
  });

  it("falls back to UNKNOWN on D1 worker error without changing category discovery or POST paywall",async()=>{
    const bad=async()=>new Response("unavailable",{status:503});
    const x=await categoryOriginalSourcePulse("geopolitics",{fetchImpl:bad as typeof fetch,now:90000});
    expect(x.observation.status).toBe("UNKNOWN_OR_NOT_YET_SYNCED");
    expect(x.observation.publisher_topic_items_in_last_30m).toBeNull();
    const handler=readFileSync("src/lib/category-intelligence-alias.server.ts","utf8");
    expect(handler).toContain("await categoryOriginalSourcePulse(config.category as CommercialIntelligenceCategory)");
    expect(handler).toContain("original_publisher_observation: sourcePulse");
    expect(handler).toContain("return mainnetIntelligenceHandlers.POST({ request: canonicalRequest })");
  });

  it("locks production D1 public read route and no-Supabase/B2 source monitor admission",()=>{
    const worker=readFileSync("workers/control-plane/src/index.mjs","utf8");
    const flow=readFileSync(".github/workflows/three-domain-30m-original-publisher-pulse.yml","utf8");
    expect(worker).toContain('url.pathname === "/v1/public/source-pulse-30m"');
    expect(worker).toContain("projectPublic30mPulse(rows)");
    expect(worker).toContain("FROM pipeline_checkpoint WHERE pipeline=?");
    expect(flow).toContain('cron: "12,42 * * * *"');
    expect(flow).toContain("node scripts/ops/write-30min-source-pulse-d1.mjs");
    expect(flow).toContain("CLOUDFLARE_API_TOKEN");
    expect(flow).not.toContain("SUPABASE_DB_URL");
    expect(flow).not.toContain("B2_KEY_ID");
    expect(flow).not.toContain("GEOMACRO_COMMERCE_LEDGER_TOKEN");
  });
});
