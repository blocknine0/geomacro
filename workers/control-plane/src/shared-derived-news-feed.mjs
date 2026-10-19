/** Read-only machine/Predge pilot projection from the SAME 72h D1 journal
 * the Geomacro Intelligence page consumes. No partner-specific scrape, queue,
 * raw publisher text, new D1 table, B2 GET, Supabase, score or x402.
 * Evaluation observations are NOT rights-certified commercial content.
 */
import {readDerivedStories} from "./website-derived-intelligence.mjs";
import {buildDerivedNewsStructural,NEWS_STRUCTURAL_SCHEMA}
  from "../../../src/lib/derived-news-structural-bridge.ts";

const CATEGORIES=["geopolitics","macro","rare_earth"];
const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
  "Referrer-Policy":"no-referrer","Access-Control-Allow-Origin":"*"};
const reply=(data,status=200)=>Response.json(data,{status,headers});
const contractPage=(value,offset)=>value?.ok===true &&
  value.schema==="geomacro.website-derived-news-feed.v1" &&
  value.delivery_scope==="free_website_only" &&
  value.retention_hours===72 && value.original_release_delay_minutes===15 &&
  value.page_offset===offset && value.page_size===250 &&
  typeof value.has_more==="boolean" && Array.isArray(value.signals) &&
  value.signals.length<=250;

export async function publicSharedDerivedNewsFeed(env,query=new URLSearchParams(),now=Date.now()){
  if(!env?.DB||!Number.isFinite(now))
    return reply({ok:false,error:"SHARED_NEWS_D1_UNAVAILABLE",chargeable:false},503);
  if([...query.keys()].some(k=>k!=="domain") ||
    query.getAll("domain").length>1 ||
    (query.has("domain")&&!CATEGORIES.includes(query.get("domain"))))
    return reply({ok:false,error:"SHARED_NEWS_QUERY_INVALID",chargeable:false},400);
  const domain=query.get("domain");
  const signals=[],seen=new Set();
  try{
    let complete=false;
    for(const offset of [0,250,500]){
      const response=await readDerivedStories(env,now,offset);
      if(response.status!==200)throw Error("SHARED_NEWS_PAGE_UNAVAILABLE");
      const data=await response.json();
      if(!contractPage(data,offset))throw Error("SHARED_NEWS_CONTRACT_INVALID");
      for(const signal of data.signals){
        if(!signal || typeof signal.id!=="string" || seen.has(signal.id))
          throw Error("SHARED_NEWS_DUPLICATE_OR_INVALID_ID");
        seen.add(signal.id);
        signals.push(signal);
      }
      if(!data.has_more){
        if(data.next_offset!==null)throw Error("SHARED_NEWS_INVALID_CURSOR");
        complete=true;break;
      }
      if(offset===500||data.next_offset!==offset+250)
        throw Error("SHARED_NEWS_INVALID_CURSOR");
    }
    if(!complete)throw Error("SHARED_NEWS_INCOMPLETE");
    const all=buildDerivedNewsStructural(signals,now);
    const counts=Object.fromEntries(CATEGORIES.map(c=>[
      c,all.filter(row=>row.category===c).length
    ]));
    const availability_by_category=Object.fromEntries(CATEGORIES.map(c=>{
      const matching=all.filter(row=>row.category===c);
      const last=matching[0]??null;
      const count24=matching.filter(row=>{
        const ms=Date.parse(row.original_published_at);
        return Number.isFinite(ms)&&ms<=now&&now-ms<=86_400_000;
      }).length;
      return [c,{
        status:matching.length===0?"NO_QUALIFIED_RELEASE_IN_72H":
          count24>0?"RECENT_OFFICIAL_RELEASE_IN_24H":"RECENT_OFFICIAL_RELEASE_IN_72H",
        latest_original_published_at:last?.original_published_at??null,
        latest_original_date_precision:last?.date_precision??null,
        observed_derived_records_24h:count24,
        observed_derived_records_72h:matching.length,
        producer_run_freshness_verified:false,
        real_time_commercial_event_certified:false,gaps_may_exist:true,
      }];
    }));
    const items=domain===null?all:all.filter(row=>row.category===domain);
    return reply({
      ok:true,schema:"geomacro.derived-news-structural-feed.v1",
      item_schema:NEWS_STRUCTURAL_SCHEMA,
      journal_origin:"SAME_D1_ROWS_AS_GEOMACRO_INTELLIGENCE",
      consumer_scope:"public_research_and_partner_pilot_evaluation_only",
      partner_resale_or_commercial_redistribution_authorized:false,
      retention_hours:72,original_release_delay_minutes:15,
      source_scope:"ELIGIBLE_RELEASES_PRESENT_IN_BOUNDED_D1_JOURNAL",
      exhaustive_all_global_sources:false,
      independent_same_event_verified:false,commercial_rights_verified:false,
      scored:false,signed:false,chargeable:false,payment_required_now:false,
      raw_upstream_delivered:false,
      generated_at:new Date(now).toISOString(),
      availability_by_category,counts,items,
    });
  }catch{
    return reply({ok:false,error:"SHARED_NEWS_D1_READBACK_UNAVAILABLE",
      chargeable:false,items:[]},503);
  }
}
