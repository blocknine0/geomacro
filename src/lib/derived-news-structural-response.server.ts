import {fetchAllDerivedNews} from "./public-derived-news-client";
import {buildDerivedNewsStructural,NEWS_STRUCTURAL_SCHEMA} from "./derived-news-structural-bridge";

const CATEGORIES=["geopolitics","macro","rare_earth"] as const;
type Domain = typeof CATEGORIES[number];
/** Publication clock, not polling clock. A zero-news day is an honest empty
 * structural window; it never becomes a synthetic real-time event. */
export function structuralNewsAvailability(
  rows:readonly {category:Domain;original_published_at:string;date_precision:"day"|"exact"}[],
  now:number,
){
  if(!Number.isFinite(now))throw Error("STRUCTURAL_AVAILABILITY_CLOCK_INVALID");
  return Object.fromEntries(CATEGORIES.map(category=>{
    const relevant=rows.filter(r=>r.category===category);
    const latest=relevant[0]??null;
    const classified=relevant.filter(r=>
      (r as {qualifying_topic_release_verified?:boolean}).qualifying_topic_release_verified!==false).length;
    const n24=relevant.filter(r=>{
      const ms=Date.parse(r.original_published_at);
      return Number.isFinite(ms)&&ms<=now&&now-ms<=86_400_000;
    }).length;
    return [category,{
      status:relevant.length===0?"NO_QUALIFIED_RELEASE_IN_72H":
        classified===0?"UNCLASSIFIED_DATED_SOURCE_CANDIDATES_ONLY":
        n24>0?"RECENT_OFFICIAL_RELEASE_IN_24H":"RECENT_OFFICIAL_RELEASE_IN_72H",
      classified_topic_releases_72h:classified,
      unclassified_source_candidates_72h:relevant.length-classified,
      latest_original_published_at:latest?.original_published_at??null,
      latest_original_date_precision:latest?.date_precision??null,
      observed_derived_records_24h:n24,
      observed_derived_records_72h:relevant.length,
      producer_run_freshness_verified:false,
      real_time_commercial_event_certified:false,
      gaps_may_exist:true,
    }];
  }));
}
const HEADERS={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
  "Access-Control-Allow-Origin":"*","Referrer-Policy":"no-referrer"};
/** GET /api/v1/intelligence/query?view=structural-72h[&domain=macro]
 * Every eligible record currently retained in the 600-row D1 journal is
 * projected; a configured, down, review-gated or unobserved source is NOT
 * asserted to have published news. No x402, signing, new storage or raw text.
 */
export async function derivedNewsStructuralResponse(
  request:Request,fetchImpl:typeof fetch=fetch,now=Date.now(),
):Promise<Response>{
  const q=new URL(request.url).searchParams;
  const domain=q.get("domain");
  if(q.getAll("view").length!==1||q.get("view")!=="structural-72h"||
     q.getAll("domain").length>1||
     [...q.keys()].some(k=>!["view","domain"].includes(k))||
     (domain!==null&&!CATEGORIES.includes(domain as typeof CATEGORIES[number])))
    return Response.json({ok:false,error:"DERIVED_STRUCTURAL_QUERY_INVALID",chargeable:false},
      {status:400,headers:HEADERS});
  try{
    const signals=await fetchAllDerivedNews(fetchImpl,now);
    const all=buildDerivedNewsStructural(signals,now);
    const rows=domain===null?all:all.filter(r=>r.category===domain);
    const counts=Object.fromEntries(CATEGORIES.map(c=>[c,all.filter(r=>r.category===c).length]));
    return Response.json({
      ok:true,schema:"geomacro.derived-news-structural-feed.v1",
      item_schema:NEWS_STRUCTURAL_SCHEMA,retention_hours:72,
      original_release_delay_minutes:15,
      source_scope:"ELIGIBLE_RELEASES_PRESENT_IN_BOUNDED_D1_JOURNAL",
      exhaustive_all_global_sources:false,
      independent_same_event_verified:false,commercial_rights_verified:false,
      scored:false,signed:false,chargeable:false,payment_required_now:false,
      raw_upstream_delivered:false,
      generated_at:new Date(now).toISOString(),
      availability_by_category:structuralNewsAvailability(all,now),
      counts,items:rows,
    },{headers:HEADERS});
  }catch{
    return Response.json({ok:false,error:"DERIVED_STRUCTURAL_JOURNAL_UNAVAILABLE",
      chargeable:false,items:[]},{status:503,headers:HEADERS});
  }
}
