import {loadMacroState,macroPriceEvidence} from "./macro-fastlane.mjs";
/** Read-only machine/Predge pilot projection from the SAME 72h D1 journal
 * the Geomacro Intelligence page consumes. No partner-specific scrape, queue,
 * raw publisher text, new D1 table, B2 GET, Supabase, score or x402.
 * Evaluation observations are NOT rights-certified commercial content.
 */
import {readDerivedStories} from "./website-derived-intelligence.mjs";
import {getNewsProducerChecks} from "./derived-news-qualification-status.mjs";
import {buildDerivedNewsStructural,NEWS_STRUCTURAL_SCHEMA}
  from "../../../src/lib/derived-news-structural-bridge.ts";

const CATEGORIES=["geopolitics","macro","rare_earth"];
const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
  "Referrer-Policy":"no-referrer","Access-Control-Allow-Origin":"*"};
const reply=(data,status=200)=>Response.json(data,{status,headers});
const contractPage=(value,offset)=>value?.ok===true &&
  value.schema==="geomacro.website-derived-news-feed.v1" &&
  value.delivery_scope==="free_website_only" &&
  value.retention_hours===72 && (value.original_release_delay_minutes===0||value.original_release_delay_minutes===15) &&
  value.page_offset===offset && value.page_size===250 &&
  typeof value.has_more==="boolean" && Array.isArray(value.signals) &&
  value.signals.length<=250;

export async function publicSharedDerivedNewsFeed(env,query=new URLSearchParams(),now=Date.now(),projection="source_neutral"){
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
    const projected=buildDerivedNewsStructural(signals,now,projection);
    let macroState={};
    if(projected.some(s=>s.category==="macro")){try{macroState=await loadMacroState(env);}catch{/* news is independent of the quote stream */}}
    const all=projected.map(row=>row.category==="macro"?{...row,macro_context:macroPriceEvidence({id:row.id,category:row.category,topic:row.topic,title:row.headline,what_changed:row.observed_change,published_at:row.original_published_at},macroState)}:row);
    const producerChecks=await getNewsProducerChecks(env,now);
    const qualified=Object.fromEntries(CATEGORIES.map(c=>[
      c,all.filter(row=>row.category===c && row.qualifying_topic_release_verified).length
    ]));
    const candidates=Object.fromEntries(CATEGORIES.map(c=>[
      c,all.filter(row=>row.category===c && !row.qualifying_topic_release_verified).length
    ]));
    const observed=Object.fromEntries(CATEGORIES.map(c=>[c,
      signals.filter(s=>s.category===c).length]));
    const creditHeld=Object.fromEntries(CATEGORIES.map(c=>[c,
      signals.filter(s=>s.category===c&&s.sources_credited?.length>0).length]));
    const counts=Object.fromEntries(CATEGORIES.map(c=>[
      c,all.filter(row=>row.category===c).length
    ]));
    const availability_by_category=Object.fromEntries(CATEGORIES.map(c=>{
      const matching=all.filter(row=>row.category===c);
      const last=matching[0]??null;
      const status=producerChecks[c];
      const held=observed[c]-matching.length;
      const count24=matching.filter(row=>{
        const ms=Date.parse(row.original_published_at);
        return Number.isFinite(ms)&&ms<=now&&now-ms<=86_400_000;
      }).length;
      return [c,{
        status:matching.length===0?"NO_QUALIFIED_RELEASE_IN_72H":
          qualified[c]===0?"UNCLASSIFIED_DATED_SOURCE_CANDIDATES_ONLY":
          count24>0?"RECENT_OFFICIAL_RELEASE_IN_24H":"RECENT_OFFICIAL_RELEASE_IN_72H",
        classified_topic_releases_72h:qualified[c],
        unclassified_source_candidates_72h:candidates[c],
        candidate_is_not_qualified_topic_or_commercial_event:true,
        latest_original_published_at:last?.original_published_at??null,
        latest_original_date_precision:last?.date_precision??null,
        observed_derived_records_24h:count24,
        observed_derived_records_72h:matching.length,
        journal_derived_records_72h:observed[c],
        journal_credit_required_records_72h:creditHeld[c],
        withheld_from_source_neutral_view_72h:projection==="source_neutral"?held:creditHeld[c],
        withheld_from_selected_projection_72h:held,
        attributed_research_records_72h:matching.filter(r=>r.attribution_required).length,
        no_qualified_release_explanation:matching.length>0?
          (projection==="attributed_research"?"ATTRIBUTED_RESEARCH_RELEASE_PRESENT":"PUBLIC_ELIGIBLE_RELEASE_PRESENT"):held>0?
          "JOURNAL_RELEASE_REQUIRES_VISIBLE_SOURCE_CREDIT":
          status.current_source_check_verified&&status.original_candidates_examined>0?
          "OFFICIAL_CANDIDATES_OBSERVED_BUT_NONE_PASSED_RELEASE_RULES":
          status.current_source_check_verified?
          "COLLECTOR_RAN_NO_QUALIFYING_RELEASE":
          "COLLECTOR_FRESHNESS_NOT_VERIFIED",
        latest_source_check:status,
        producer_run_freshness_verified:status.current_source_check_verified,
        separate_verified_structural_context_path:
          "/v1/public/three-domain-continuity",
        reference_data_is_not_a_new_official_release:true,
        real_time_commercial_event_certified:false,gaps_may_exist:true,
      }];
    }));
    const items=domain===null?all:all.filter(row=>row.category===domain);
    return reply({
      ok:true,schema:"geomacro.derived-news-structural-feed.v1",
      item_schema:NEWS_STRUCTURAL_SCHEMA,
      projection,
      attribution_must_be_preserved:projection==="attributed_research",
      attribution_is_not_a_grant_of_source_rights:true,
      journal_origin:"SAME_D1_ROWS_AS_GEOMACRO_INTELLIGENCE",
      consumer_scope:"public_research_and_partner_pilot_evaluation_only",
      partner_resale_or_commercial_redistribution_authorized:false,
      retention_hours:72,original_release_delay_minutes:0,
      source_scope:"ELIGIBLE_RELEASES_PRESENT_IN_BOUNDED_D1_JOURNAL",
      exhaustive_all_global_sources:false,
      independent_same_event_verified:false,commercial_rights_verified:false,
      scored:false,signed:false,chargeable:false,payment_required_now:false,
      raw_upstream_delivered:false,
      generated_at:new Date(now).toISOString(),
      availability_by_category,counts,items,
      unclassified_source_candidates_72h:Object.values(candidates).reduce((a,b)=>a+b,0),
      classified_topic_releases_72h:Object.values(qualified).reduce((a,b)=>a+b,0),
      pilot_evaluation_only:true,pilot_window_days:90,
      partner_api_payment_required:false,pilot_sla_guaranteed:false,
      producer_observations_separate_from_original_release_clocks:true,
    });
  }catch{
    return reply({ok:false,error:"SHARED_NEWS_D1_READBACK_UNAVAILABLE",
      chargeable:false,items:[]},503);
  }
}
