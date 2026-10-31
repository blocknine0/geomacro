import {fetchHomeDerivedNews} from "./home-derived-news-client";
import {assertFindCardV1,findCardFromObservedRelease,type FindCardV1} from "./find-card-v1";

const NO_STORE={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
  "Access-Control-Allow-Origin":"*","Referrer-Policy":"no-referrer"};
const domains=["geopolitics","macro","rare_earth"];
/** Derived website journal only; never touches paid GRO/x402, secret issuer
 * proof, Supabase, B2 or a publication runtime. No source/raw titles. */
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
  const cards=signals.map(s=>findCardFromObservedRelease(s,now))
    .filter((v):v is FindCardV1=>v!==null)
    .filter(card=>domain===null||card.domain===domain)
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
