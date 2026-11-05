import { askDomains } from "./ask-domain-guide";
import { freshnessMaxAgeHours } from "./ask-freshness";
import { fetchEdgeLatestDerivedNews } from "./public-derived-news-client";
import type { HybridAskAnswer } from "./hybrid-ask-intelligence.server";

/** Public-safe only. No private feed, raw OSINT story, source URL, publisher
 * identity, licence metadata or original text is ever sent to a model.
 * Verified OSINT-derived events may enter through the existing canonical
 * evidence (B2/original independent verification); feed sightings alone do not.
 */
export type AskModelContext = {
  categories: string[];
  canonical_evidence_items: number;
  research_activity_by_category: Array<{ category: string; count: number }>;
  official_release_context: Array<{ category: string; topic: string; published_at: string }>;
};

export async function collectAskModelContext(
  question: string,
  answer: HybridAskAnswer,
  opts: {
    now?: number;
    readEdge?: () => Promise<Awaited<ReturnType<typeof fetchEdgeLatestDerivedNews>>>;
  } = {},
): Promise<AskModelContext> {
  const detected=askDomains(question);
  const categories=detected.length?detected:["geopolitics","macro","rare_earth"];
  const result:AskModelContext={
    categories:[...categories],
    canonical_evidence_items:Math.min(5,Math.max(0,answer.evidence?.length??0)),
    research_activity_by_category:[],official_release_context:[],
  };
  const maxAge=freshnessMaxAgeHours(question);
  if(maxAge===null||answer.answer_kind==="public_info"||
    answer.real_time_message==="CURRENT_SIGNED_RISK_INDEX_UNAVAILABLE")
    return result;
  const now=opts.now??Date.now();
  let rows:Awaited<ReturnType<typeof fetchEdgeLatestDerivedNews>>;
  try{ rows=await (opts.readEdge??(()=>fetchEdgeLatestDerivedNews(fetch,now)))(); }
  catch{ return result; }
  const counts=new Map<string,number>();
  for(const row of rows.slice(0,250)){
    if(!categories.includes(row.category))continue;
    const timestamp=Date.parse(row.published_at??"");
    if(!Number.isFinite(timestamp)||timestamp>now||now-timestamp>Math.min(maxAge,24)*3600_000)
      continue;
    if(row.status==="osint_feed_observed_unverified"){
      counts.set(row.category,Math.min(20,(counts.get(row.category)??0)+1));
    }else if(row.status==="official_release_observed_unscored"&&
      result.official_release_context.length<3&&
      row.same_event_corrob_verified===false&&row.severity===null&&
      /^[a-z0-9][a-z0-9 -]{3,89}$/iu.test(row.topic??"")){
      result.official_release_context.push({
        category:row.category,topic:row.topic,published_at:row.published_at,
      });
    }
  }
  result.research_activity_by_category=[...counts].map(([category,count])=>({category,count}));
  return result;
}
