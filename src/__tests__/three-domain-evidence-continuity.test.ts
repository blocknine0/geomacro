import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {threeDomainEvidenceContinuity} from "../../workers/control-plane/src/three-domain-evidence-continuity.mjs";

const NOW=Date.parse("2026-10-18T19:20:00.000Z");
const ISO=new Date(NOW).toISOString(),domains=["geopolitics","macro","rare_earth"];
const names={geopolitics:"geopolitics",macro:"macro-fx",rare_earth:"critical-minerals"};
const sample=(d:string,at=ISO)=>({
 schema_version:"geomacro.category-open-data-observations.v1",category:names[d],
 mode:"UNSCORED_OPEN_DATA_CONTEXT",checked_at:at,
 source_families_attempted:2,source_families_readable:1,source_families_unavailable:1,
 status:"DERIVED_CONTEXT_AVAILABLE",
 findings:[{finding_key:"official:"+d,evidence_class:"official_open_data_unscored",
 observation_type:"annual_statistical_reference",observation_period:"2025",
 clock_semantics:"reference_year",geomacro_finds:"Official statistical reference period observed.",
 why_it_matters:"An annual baseline informs long-term context and is not a new event.",
 independent_same_event_verification:false,score:null}],
 licensed_source_credits:[],
 observations_are_current_release_news:false,source_event_and_period_clocks_distinct:true,
 source_names_and_urls_private_except_required_credits:true,upstream_payloads_exposed:false,
 risk_score:null,independent_same_event_verification:false,signed_gro_generated:false,
 x402_payment_required:false,chargeable:false,paid_delivery_authorized:false,
 persistent_storage_written:false
});
const journal=(offset:number)=>({
 ok:true,page_offset:offset,page_size:250,has_more:false,next_offset:null,signals:[]
});
function env({
 ctx=Object.fromEntries(domains.map(d=>[d,sample(d)])),
 journalFail=false,pulseFail=false,checkpointFail=false,
 news=journal(0),
}={}){
 let pages=0;
 return {DB:{prepare:(sql:string)=>({bind:(...args:any[])=>({
   first:async()=>checkpointFail?Promise.reject(Error("D1 down")):
     {metadata_json:JSON.stringify({context:ctx[args[1]]??null})},
   all:async()=>{
     if(sql.includes("website_derived_intelligence")){
       if(journalFail)throw Error("journal failed");
       pages++;return {results:(news.signals||[]).slice((args[2]||0),(args[2]||0)+251)
         .map((s:any)=>({story_json:JSON.stringify(s)}))};
     }
     if(pulseFail)throw Error("pulse failed");
     return {results:[]};
   }
 })})},readPages:()=>pages};
}
describe("continuous three-category source observations backed by D1",()=>{
 it("returns 3 current verified source contexts independently of no-new-news",async()=>{
   const f=env();
   const result=await threeDomainEvidenceContinuity(f,NOW);
   expect(result.status).toBe(200);
   const data=await result.json();
   expect(data.schema).toBe("geomacro.three-domain-evidence-continuity.v1");
   expect(Object.keys(data.categories).sort()).toEqual([...domains].sort());
   expect(data.all_categories_source_check_current).toBe(true);
   expect(data.all_categories_have_observation).toBe(true);
   expect(data.journal_complete).toBe(true);
   for(const d of domains){
     expect(data.categories[d].native_news_event_count_72h).toBe(0);
     expect(data.categories[d].service_state).toBe("CURRENT_SOURCE_CHECK_WITH_DATA");
     expect(data.categories[d].official_open_data_findings[0].clock_semantics).toBe("reference_year");
     expect(data.categories[d].current_news_guaranteed).toBe(false);
     expect(data.categories[d].chargeable).toBe(false);
   }
   expect(data.raw_upstream_delivered).toBe(false);
   expect(data.commercial_rights_verified).toBe(false);
   expect(data.upstream_new_event_guaranteed).toBe(false);
 });
 it("keeps three different real publisher-clock news observations distinct from baseline",async()=>{
   const published=new Date(NOW-65*60_000).toISOString();
   const signals=domains.map((category,i)=>({
     id:category+"-"+(i+1).toString(16).padStart(8,"0"),category,
     title:"Geomacro finds an official source release in the relevant domain",
     what_changed:"An official publisher released a statement relevant to this monitored category.",
     why_it_matters:"The release may affect operating conditions but no causal impact is verified.",
     topic:["foreign policy","monetary policy","rare-earth supply"][i],
     development_type:"policy update",geography:null,
     published_at:published,date_precision:"exact",observed_release_count:1,
     sources_credited:[],status:"official_release_observed_unscored",
     same_event_corrob_verified:false,severity:null,
   }));
   const f=env({news:{...journal(0),signals}});
   const data=await (await threeDomainEvidenceContinuity(f,NOW)).json();
   expect(data.journal_complete).toBe(true);
   for(const d of domains){
     expect(data.categories[d].native_news_event_count_72h).toBe(1);
     expect(data.categories[d].latest_native_news_published_at).toBe(published);
     expect(data.categories[d].source_neutral_news[0].id).toMatch(/^[a-z_]+-[0-9a-f]{8}$/);
     expect(data.categories[d].source_neutral_news[0]).not.toHaveProperty("sources_credited");
     expect(data.categories[d].source_neutral_news[0]).not.toHaveProperty("source_url");
     expect(data.categories[d].source_neutral_news[0].date_precision).toBe("exact");
     expect(data.categories[d].commercial_rights_verified).toBe(false);
   }
 });
 it("keeps a previous measured baseline with OLD source clock after cron lapse",async()=>{
   const older=new Date(NOW-6*3_600_000).toISOString();
   const f=env({ctx:Object.fromEntries(domains.map(d=>[d,sample(d,older)]))});
   const r=await threeDomainEvidenceContinuity(f,NOW);
   const data=await r.json();
   expect(data.all_categories_source_check_current).toBe(false);
   for(const d of domains){
     expect(data.categories[d].source_check_current).toBe(false);
     expect(data.categories[d].latest_source_check_at).toBe(older);
     expect(data.categories[d].open_data_reference_status).toBe("LAST_KNOWN_HISTORICAL_NOT_REALTIME");
     expect(data.categories[d].service_state).toBe("LAST_KNOWN_OR_NEWS_ONLY_NOT_CURRENT_SOURCE_CHECK");
   }
 });
 it("one source outage and journal outage do not erase independently validated other category",async()=>{
   const f=env({ctx:{macro:sample("macro"),rare_earth:sample("rare_earth")},
     journalFail:true,pulseFail:true,checkpointFail:false});
   const response=await threeDomainEvidenceContinuity(f,NOW);
   expect(response.status).toBe(200);
   const body=await response.json();
   expect(body.journal_complete).toBe(false);
   expect(body.categories.geopolitics.data_present).toBe(false);
   expect(body.categories.macro.service_state).toBe("CURRENT_SOURCE_CHECK_WITH_DATA");
   expect(body.categories.rare_earth.data_present).toBe(true);
   expect(body.all_categories_have_observation).toBe(false);
 });
 it("unknown/bad raw context never creates live evidence; returns three honest empty states",async()=>{
   const forged=sample("macro");(forged as any).paid_delivery_authorized=true;
   const f=env({ctx:{macro:forged,rare_earth:sample("geopolitics")}});
   const data=await (await threeDomainEvidenceContinuity(f,NOW)).json();
   expect(data.categories.macro.data_present).toBe(false);
   expect(data.categories.macro.source_check_current).toBe(false);
   expect(data.categories.rare_earth.data_present).toBe(false);
   expect(data.three_domains_returned).toBe(true);
 });
 it("does not return misleading HTTP 200 when all D1 readers fail",async()=>{
   const f=env({journalFail:true,pulseFail:true,checkpointFail:true});
   const r=await threeDomainEvidenceContinuity(f,NOW);
   expect(r.status).toBe(503);
   const body=await r.json();
   expect(body).toMatchObject({ok:false,chargeable:false,
     error:"CONTINUITY_ALL_READBACKS_UNAVAILABLE"});
   expect(body).not.toHaveProperty("available");
 });

 it("source runtime older than 14 days becomes unavailable, never renewed",async()=>{
   const at=new Date(NOW-15*86_400_000).toISOString();
   const f=env({ctx:Object.fromEntries(domains.map(d=>[d,sample(d,at)]))});
   const data=await (await threeDomainEvidenceContinuity(f,NOW)).json();
   expect(data.all_categories_have_observation).toBe(false);
   expect(data.categories.macro.latest_source_check_at).toBeNull();
 });
 it("has a direct Worker route independent of Lovable, Supabase or x402 payment",()=>{
   const index=readFileSync("workers/control-plane/src/index.mjs","utf8");
   expect(index).toContain('/v1/public/three-domain-continuity');
   expect(index).toContain("threeDomainEvidenceContinuity(env)");
   const deploy=readFileSync(".github/workflows/deploy-d1-control-plane.yml","utf8");
   expect(deploy).toContain('Verify three-domain continuity direct Worker readback (no funds)');
   expect(deploy).toContain('geomacro.three-domain-evidence-continuity.v1');
   expect(deploy).toContain('THREE_DOMAIN_CONTINUITY_DIRECT_D1_LIVE_READBACK_FAILED');
   expect(deploy).not.toContain('settleCoinbaseX402');

   const code=readFileSync("workers/control-plane/src/three-domain-evidence-continuity.mjs","utf8");
   expect(code).not.toContain("settleCoinbaseX402");
   expect(code).not.toContain("requireRiskSupabase");
 });
});
