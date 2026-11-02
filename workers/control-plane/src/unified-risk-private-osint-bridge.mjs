/**
 * Country-specific private OSINT research -> unified risk observation bridge.
 *
 * Operates entirely inside the existing private Cloudflare D1 control plane.
 * A feed-native timestamp and a country title match are NOT independently
 * verified event evidence, signed GRO, permission to republish, or a score.
 *
 * Only returns a bounded deduplicated COUNT. Never exports, queries or stores
 * the private projection JSON, source URL, headline, publisher or item ID.
 * The caller consults this fallback ONLY when canonical D1 originals are
 * absent, preventing unsupported cross-lane source-count inflation.
 */
import {CATEGORY_SPECS} from "./unified-risk-categories.mjs";

const HEX=/^[a-f0-9]{64}$/u;
const ISO3=/^[A-Z]{3}$/u;
const WINDOW_MS=24*60*60*1000;
const MAX=20;
export const PRIVATE_OSINT_RISK_EVIDENCE_LANE="D1_PRIVATE_OSINT_RESEARCH_ONLY";
export const PRIVATE_OSINT_RISK_STATUS="NATIVE_FEED_OBSERVED_ORIGINAL_PAGE_UNVERIFIED";

/** A narrow, indexed D1 read: at most 21 rows, never the 4000-row OSINT ring. */
export async function countPrivateOsintCountryEvidence(env,{
 countryId,category,now=Date.now(),
}={}){
 const rawCategory=CATEGORY_SPECS[category]?.raw_category;
 if(!ISO3.test(String(countryId??""))||!rawCategory||!Number.isFinite(now))
  throw Error("UNIFIED_OSINT_BRIDGE_TARGET_INVALID");
 if(!env?.DB?.prepare)throw Error("UNIFIED_OSINT_BRIDGE_D1_UNAVAILABLE");
 const from=new Date(now-WINDOW_MS).toISOString();
 const until=new Date(now).toISOString();
 // Composite country/category/clock index installed via migration 0110.
 // The research item ID is read only into transient memory for deduplication.
 const result=await env.DB.prepare(
  "SELECT item_id,native_feed_published_at,verification_status "+
  "FROM private_osint_news_25h "+
  "WHERE country_iso3=? AND category=? AND native_feed_published_at>=? "+
  "AND native_feed_published_at<=? "+
  "ORDER BY native_feed_published_at DESC,item_id DESC LIMIT 21"
 ).bind(countryId,rawCategory,from,until).all();
 if(!Array.isArray(result?.results)||result.results.length>21)
  throw Error("UNIFIED_OSINT_BRIDGE_READBACK_INVALID");
 const seen=new Set();
 for(const item of result.results){
  if(!HEX.test(String(item?.item_id??""))||
   item.verification_status!==PRIVATE_OSINT_RISK_STATUS)continue;
  const at=Date.parse(String(item.native_feed_published_at??""));
  if(!Number.isFinite(at)||at<now-WINDOW_MS||at>now)continue;
  seen.add(item.item_id);
  if(seen.size>=MAX)break;
 }
 return {observed_count:seen.size,source_lane:PRIVATE_OSINT_RISK_EVIDENCE_LANE,
  original_page_verified:false,event_verified:false,scored:false};
}
