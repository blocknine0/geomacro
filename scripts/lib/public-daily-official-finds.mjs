/**
 * Public homepage daily shortlist - from already-validated immutable archive.
 * No new D1/B2/Supabase/source calls, LLM-generated claims, financial scores,
 * raw publisher URLs, or OSINT promotion. Attribution is retained for display.
 */
export const PUBLIC_DAILY_FINDS_SCHEMA="geomacro.public-daily-official-finds.v1";
const DOMAINS=["geopolitics","macro","rare_earth"];
const DAY=86_400_000;
const MAX_AGE=30*DAY;
const MAX_PER_CATEGORY=12; // At most 36 verified <=5KB rows: bounded under the 200KB public contract.
const MATERIAL=/\b(?:sanctions?|ceasefire|war|peace|conflict|security council|resolution|election|treaty|trade agreement|tariffs?|embargo|border|shipping|gdp|inflation|interest rate|federal reserve|central bank|fomc|employment|unemployment|forex|currency|exports?|imports?|critical minerals?|rare earths?|lithium|nickel|cobalt|copper|gallium|germanium|supply chain|refin(?:ing|ery)|production|investment|invested|awarded|funding|approved|issued|published|announced|introduced|revised)\b/iu;
const BAD=/\b(?:publisher candidate|source.feed observation|unverified|an official publisher|feed contains a dated item)\b/iu;
export function buildDailyOfficialFinds(rows,now=Date.now()){
  if(!Number.isFinite(now))throw Error("DAILY_FINDS_CLOCK_INVALID");
  const eligible=rows.filter(s=>{
    if(!s||s.status!=="official_release_observed_unscored"||
       !DOMAINS.includes(s.category)||!Array.isArray(s.sources_credited)||
       typeof s.id!=="string"||typeof s.title!=="string"||
       typeof s.what_changed!=="string"||typeof s.published_at!=="string"||
       BAD.test(s.title+" "+s.what_changed)||
       !MATERIAL.test(s.title+" "+s.what_changed))return false;
    const date=s.date_precision==="day"
      ?s.published_at+"T00:00:00.000Z":s.published_at;
    const at=Date.parse(date);
    return Number.isFinite(at)&&at<=now&&now-at<=MAX_AGE&&
      (s.date_precision!=="day"||at+36*3_600_000<=now);
  });
  const chosen=[],seen=new Set();
  for(const category of DOMAINS){
    const categoryRows=eligible.filter(s=>s.category===category)
      .sort((a,b)=>b.published_at.localeCompare(a.published_at)||a.id.localeCompare(b.id));
    let n=0;
    for(const signal of categoryRows){
      if(seen.has(signal.id))continue;
      seen.add(signal.id);chosen.push(signal);
      if(++n>=MAX_PER_CATEGORY)break;
    }
  }
  chosen.sort((a,b)=>b.published_at.localeCompare(a.published_at)||a.id.localeCompare(b.id));
  return {
    ok:true,schema:PUBLIC_DAILY_FINDS_SCHEMA,
    generated_at:new Date(now).toISOString(),
    selection_window_days:30,source_window:"archived_original_release",
    official_only:true,independently_corrob_verified:false,
    chargeable:false,scored:false,source_urls_returned:false,
    mandatory_source_credits_preserved:true,
    signals:chosen,
  };
}
