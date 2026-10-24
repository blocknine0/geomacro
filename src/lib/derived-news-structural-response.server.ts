import {fetchAllDerivedNews} from "./public-derived-news-client";
import {country195ByIso3} from "./canonical-country-registry-195";
import {observed195x3Coverage,observedDerivedNewsForCountry} from "./derived-news-country-coverage-195";
import {buildDerivedNewsStructural,NEWS_STRUCTURAL_SCHEMA} from "./derived-news-structural-bridge";
import {normalizeReusableNewsJson,REUSABLE_NEWS_JSON_SCHEMA} from "./reusable-news-json";
import {fetchAllReusableSourceNews} from "./live-reusable-source-news-client";

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
  const country=q.get("country");
  const view=q.get("view");
  const coverageView=view==="country-coverage-195x3";
  const reusableView=view==="reusable-news-json";
  if(q.getAll("view").length!==1||
     !["structural-72h","country-coverage-195x3","reusable-news-json"].includes(view??"")||
     q.getAll("domain").length>1||q.getAll("country").length>1||
     [...q.keys()].some(k=>!["view","domain","country"].includes(k))||
     (domain!==null&&!CATEGORIES.includes(domain as typeof CATEGORIES[number]))||
     (country!==null&&!country195ByIso3(country)))
    return Response.json({ok:false,error:"DERIVED_STRUCTURAL_QUERY_INVALID",chargeable:false},
      {status:400,headers:HEADERS});
  try{
    // Independently degrade either of the two existing D1 news lanes.
    let sourceResult:Awaited<ReturnType<typeof fetchAllReusableSourceNews>>|null=null;
    if(reusableView){
      try{sourceResult=await fetchAllReusableSourceNews(fetchImpl,now,{country,domain})}
      catch{/* a functioning editorial journal can still serve */}
    }
    let signals:Awaited<ReturnType<typeof fetchAllDerivedNews>>;
    try{signals=await fetchAllDerivedNews(fetchImpl,now)}
    catch(e){
      if(!reusableView||sourceResult===null)throw e;
      signals=[];
    }
    const all=buildDerivedNewsStructural(signals,now);
    if(coverageView)return Response.json(
      observed195x3Coverage(all,now,{
        country,domain:domain as Domain|null,
      }),{headers:HEADERS});
    // Country routing is exact original-title geography mention only.
    // Absence is UNKNOWN source coverage, never a "no news in country" claim.
    const scoped=country===null?all:observedDerivedNewsForCountry(all,country);
    const rows=domain===null?scoped:scoped.filter(r=>r.category===domain);
    const counts=Object.fromEntries(CATEGORIES.map(c=>[c,scoped.filter(r=>r.category===c).length]));
    if(reusableView){
      const newsWindowStart=now-25*3600000;
      const items=rows.filter(r=>r.date_precision==="exact"&&
        Number.isFinite(Date.parse(r.original_published_at))&&
        Date.parse(r.original_published_at)>=newsWindowStart&&
        Date.parse(r.original_published_at)<=now).map(r=>{
        const normalized=normalizeReusableNewsJson({
          category:r.category,
          text:r.observed_change+" "+r.potential_relevance,
          ...(r.date_precision==="exact"?{published_at:r.original_published_at}:{}),
          license:"unknown",
        });
        return {...normalized,source_record_id:r.id,
          original_release_at:r.original_published_at,
          date_precision:r.date_precision,
          source_material_class:"EXISTING_GEOMACRO_DERIVED_JOURNAL",
          upstream_source_rights_unverified:true};
      });
      const fromRegistered=sourceResult?.items.filter(item=>
        (domain===null||item.category===domain)&&
        (country===null||item.country_iso3===country))??[];
      const combined=[...items,...fromRegistered];
      const mixedCounts=Object.fromEntries(CATEGORIES.map(c=>[
        c,combined.filter(item=>item.category===c).length,
      ]));
      return Response.json({
        ok:true,schema:"geomacro.reusable-news-json-live-feed.v1",
        item_schema:REUSABLE_NEWS_JSON_SCHEMA,
        source_scope:"EXISTING_DERIVED_D1_PLUS_ROTATED_REGISTERED_SOURCE_NEWS",
        registered_source_reader_state:sourceResult===null?
          "UNAVAILABLE_OR_NOT_DEPLOYED":"AVAILABLE",
        registered_source_checks_24h:sourceResult?.checked_source_states??{},
        registered_source_items:fromRegistered.length,
        retention_hours:25,
        source_reader_preview_has_more:sourceResult?.has_more??false,
        editorial_derived_items:items.length,
        unobserved_sources_not_reported_as_no_news:true,
        country_filter:country,domain_filter:domain,
        counts:mixedCounts,count:combined.length,items:combined,
        exhaustive_worldwide_coverage:false,
        upstream_permissions_automatically_granted:false,
        commercial_product_ready:false,raw_article_delivered:false,
      },{headers:HEADERS});
    }
    return Response.json({
      ok:true,schema:"geomacro.derived-news-structural-feed.v1",
      item_schema:NEWS_STRUCTURAL_SCHEMA,retention_hours:72,
      original_release_delay_minutes:0,
      source_scope:"ELIGIBLE_RELEASES_PRESENT_IN_BOUNDED_D1_JOURNAL",
      exhaustive_all_global_sources:false,
      independent_same_event_verified:false,commercial_rights_verified:false,
      scored:false,signed:false,chargeable:false,payment_required_now:false,
      raw_upstream_delivered:false,
      generated_at:new Date(now).toISOString(),
      ...(country===null?{}:{country:{
        iso3:country,name:country195ByIso3(country)!.name,
        routing_basis:"EXACT_ORIGINAL_TITLE_GEOGRAPHY_MENTION_ONLY",
        country_subject_verified:false,all_news_exhaustive:false,
        no_matching_rows_does_not_mean_no_news:true,
      }}),
      availability_by_category:structuralNewsAvailability(scoped,now),
      counts,items:rows,
    },{headers:HEADERS});
  }catch{
    return Response.json({ok:false,error:"DERIVED_STRUCTURAL_JOURNAL_UNAVAILABLE",
      chargeable:false,items:[]},{status:503,headers:HEADERS});
  }
}
