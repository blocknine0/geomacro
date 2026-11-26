import {fetchHomeDerivedNews} from "./home-derived-news-client";
import {assertFindCardV1,findCardFromObservedRelease,type FindCardV1} from "./find-card-v1";

const NO_STORE={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
  "Access-Control-Allow-Origin":"*","Referrer-Policy":"no-referrer"};
const domains=["geopolitics","macro","rare_earth"];
/** Derived website journal only; never touches paid GRO/x402, secret issuer
 * proof, Supabase, B2 or a publication runtime. No source/raw titles. */

function cleanBounded(text: unknown, max: number): string {
  const clean = String(text ?? "").replace(/[<>]/gu, "").replace(/https?:\/\/\S+|www\.\S+/giu, "").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const idx = cut.lastIndexOf(" ");
  return (idx > 0 ? cut.slice(0, idx) : cut).trimEnd() + "…";
}
function findCardFromObservedBrief(s: any, now: number): FindCardV1 | null {
  if (!s || s.status !== "osint_feed_observed_unverified") return null;
  const originalDate = s.date_precision === "day" ? s.published_at + "T00:00:00.000Z" : s.published_at;
  const at = Date.parse(originalDate);
  if (!Number.isFinite(at) || at > now) return null;
  const age = now - at;
  const freshness: FindCardV1["freshness"] =
    s.date_precision === "day" ? "daily" :
    age <= 2 * 60 * 60_000 ? "near_realtime" :
    age <= 86400_000 ? "daily" : age <= 7 * 86400_000 ? "weekly" : "monthly";
  const iso3 = typeof s.country_iso3 === "string" && /^[A-Z]{3}$/u.test(s.country_iso3) ? [s.country_iso3] : [];
  const card: FindCardV1 = {
    schema: "geomacro.find.v1",
    id: s.id,
    domain: s.category,
    published_at: originalDate,
    date_precision: s.date_precision,
    action_class: "observed_brief",
    headline: cleanBounded(s.title, 120),
    what_changed: cleanBounded(s.what_changed, 280),
    facts: [],
    why_it_matters: cleanBounded(s.why_it_matters, 260),
    watch_next: {
      kind: "follow_up_check",
      text: "Check later releases for independent corroboration; this brief is an observed feed signal.",
    },
    ladder: "OBSERVED",
    evidence_directness: "INDIRECT",
    subjects: { countries: iso3, corridors: [], commodities: [], instruments: [] },
    freshness,
    detail_state: "LIMITED",
    extraction_confidence: 0,
    severity: null,
  };
  try {
    assertFindCardV1(card);
    return card;
  } catch {
    return null;
  }
}

export async function publicFindCardsResponse(
 request:Request,fetchImpl:typeof fetch=fetch,now=Date.now(),
):Promise<Response>{
 const params=new URL(request.url).searchParams;
 const domain=params.get("domain");
 if(!Number.isFinite(now)||[...params.keys()].some(k=>k!=="domain")||
    params.getAll("domain").length>1||
    (domain!==null&&!domains.includes(domain)))
   return Response.json({ok:false,error:"FIND_CARD_QUERY_INVALID",chargeable:false},
     {status:400,headers:NO_STORE});
 try{
  // This reader enforces existing D1 native-original publication embargo
  // BEFORE conversion to the public schema. No synthetic recency or source.
  const signals=await fetchHomeDerivedNews(fetchImpl,now);
  const officialCards=signals.map(s=>findCardFromObservedRelease(s,now))
     .filter((v):v is FindCardV1=>v!==null)
     .filter(card=>domain===null||card.domain===domain);
   const targetDomains = domain ? [domain] : domains;
   const missingDomains = new Set(targetDomains.filter(d => !officialCards.some(c => c.domain === d)));
   const briefCards = missingDomains.size > 0
     ? signals
         .filter(s => missingDomains.has(s.category))
         .map(s => findCardFromObservedBrief(s, now))
         .filter((v): v is FindCardV1 => v !== null)
     : [];
   const cards=[...officialCards, ...briefCards]
     .sort((a,b)=>b.published_at.localeCompare(a.published_at)||
       a.id.localeCompare(b.id)).slice(0,100);
  cards.forEach(assertFindCardV1);
  return Response.json({ok:true,schema:"geomacro.find-card-feed.v1",
    version:"v1",cards,chargeable:false,scored:false,
    independent_same_event_verified:false,source_metadata_returned:false,
    original_release_delay_minutes:0},
   {headers:NO_STORE});
 }catch{
  return Response.json({ok:false,error:"FIND_CARD_SOURCE_JOURNAL_UNAVAILABLE",
    chargeable:false,cards:[]},{status:503,headers:NO_STORE});
 }
}
