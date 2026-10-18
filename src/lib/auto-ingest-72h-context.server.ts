import {country195ByIso3} from "./canonical-country-registry-195";
import {fetchDirectDerivedNews,fetchAllDerivedNews} from "./public-derived-news-client";
import type {StatelessIntelligenceSignal} from "./stateless-intelligence-model";

type Domain="geopolitics"|"macro"|"rare_earth";
export const AUTO_INGEST_CONTEXT_HOURS=72;
export type AutoIngestStructuredDraft={
  schema:"geomacro.auto-ingest-structured-draft.v1";
  derived_id:string;
  category:Domain;
  subject_iso3:string;
  topic:string;
  observed_original_publication:string;
  date_precision:"exact"|"day";
  what_changed:string;
  why_it_matters:string;
  evidence_status:"UNVERIFIED_DERIVED_RESEARCH_HINT";
  country_subject_verified:false;
  independent_same_event_verified:false;
  commercial_derived_rights_verified:false;
  signed_product_verified:false;
  payable:false;
};
/** A source-header country mention is a discovery hint, NEVER independent
 * country relevance/corroboration, article rights, or a billed product.
 * Fields derive solely from the already-published Geomacro-owned 72h D1
 * journal; original links, titles, raw news and provider IDs are absent.
 */
export function buildAutoIngest72hStructuredDrafts(
  signals:readonly StatelessIntelligenceSignal[],
  iso3:string,categories:readonly Domain[],now=Date.now(),
):AutoIngestStructuredDraft[]{
  const country=country195ByIso3(iso3);
  if(!country||!Number.isFinite(now)||!Array.isArray(signals)||
     signals.length>600||!Array.isArray(categories)||categories.length<1||
     categories.length>3||categories.some(c=>!["geopolitics","macro","rare_earth"].includes(c)))
    return [];
  // The original title's finite-vocabulary geography flag cannot be
  // inferred from the publishing authority's jurisdiction.
  const accepted=new Set([country.name,...country.aliases].map(s=>s.toLowerCase()));
  if(iso3==="PSE")accepted.add("palestinian territories");
  const seen=new Set<string>();
  const drafts:AutoIngestStructuredDraft[]=[];
  for(const s of signals){
    if(!categories.includes(s.category)||!s.geography||
       !accepted.has(s.geography.toLowerCase())||seen.has(s.id)||
       s.same_event_corrob_verified!==false||s.severity!==null||
       s.status!=="official_release_observed_unscored")continue;
    const at=Date.parse(s.published_at);
    if(!Number.isFinite(at)||at>now||at<now-72*3_600_000)continue;
    seen.add(s.id);
    drafts.push({
      schema:"geomacro.auto-ingest-structured-draft.v1",
      derived_id:s.id,category:s.category,subject_iso3:iso3,topic:s.topic,
      observed_original_publication:s.published_at,
      date_precision:s.date_precision,
      what_changed:s.what_changed,why_it_matters:s.why_it_matters,
      evidence_status:"UNVERIFIED_DERIVED_RESEARCH_HINT",
      country_subject_verified:false,independent_same_event_verified:false,
      commercial_derived_rights_verified:false,signed_product_verified:false,
      payable:false,
    });
    if(drafts.length>=64)break;
  }
  return drafts;
}
/** Optional bounded free D1 context for the EXISTING canonical income API.
 * On outage the paid engine still runs its original qualification, without
 * silently upgrading any draft to original evidence. No storage or payment.
 */
export async function readAutoIngest72hStructuredDrafts(
  iso3:string,categories:readonly Domain[],fetchImpl:typeof fetch=fetch,
  now=Date.now(),
):Promise<AutoIngestStructuredDraft[]>{
  try{
    const signals=await fetchDirectDerivedNews(fetchImpl,now);
    return buildAutoIngest72hStructuredDrafts(signals,iso3,categories,now);
  }catch{return [];}
}

/** Complete bounded multi-page D1 research context for paid API discovery.
 * This never authorizes commercial output, evidence signing or a charge.
 * During older Worker deploys we preserve the safe previous 250-row reader.
 */
export async function readAllAutoIngest72hStructuredDrafts(
  iso3:string,categories:readonly Domain[],fetchImpl:typeof fetch=fetch,
  now=Date.now(),
):Promise<AutoIngestStructuredDraft[]>{
  try{
    return buildAutoIngest72hStructuredDrafts(
      await fetchAllDerivedNews(fetchImpl,now),iso3,categories,now);
  }catch{
    return readAutoIngest72hStructuredDrafts(iso3,categories,fetchImpl,now);
  }
}
