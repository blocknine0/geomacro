/**
 * Predge private FREE research delivery: same already-safe 72-hour derived
 * D1 records used by website Intelligence. No secondary item allowlist,
 * private news store, raw original text or commercial redistribution grant.
 *
 * Partner credential is a dedicated domain-separated secret provisioned by
 * the existing Cloudflare production deploy from the existing root secret.
 * The shared D1 security budget enforces 500 authenticated requests/day.
 */
import {publicSharedDerivedNewsFeed} from "./shared-derived-news-feed.mjs";
import {consumeCentralSecurityBudget} from "./central-security-budget.mjs";

const ROUTE_CLASS="predge_news_pilot";
const SCHEMA="geomacro.predge-derived-news-pilot.v1";
const HEADERS={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff",
  "Referrer-Policy":"no-referrer","Vary":"Authorization",
  "X-Robots-Tag":"noindex, nofollow"};
const respond=(data,status)=>Response.json(data,{status,headers:HEADERS});
function secureTokenMatch(supplied,expected){
  if(typeof expected!=="string"||!/^[a-f0-9]{64}$/u.test(expected)||
    typeof supplied!=="string"||!/^[a-f0-9]{64}$/u.test(supplied))return false;
  let unequal=0;
  for(let i=0;i<64;i++)unequal|=supplied.charCodeAt(i)^expected.charCodeAt(i);
  return unequal===0;
}
async function keyHash(token){
  const h=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));
  return Array.from(new Uint8Array(h),b=>b.toString(16).padStart(2,"0")).join("");
}
export async function predgeAuthenticatedDerivedNews(request,env,now=Date.now()){
  const expected=String(env?.PREDGE_NEWS_PILOT_TOKEN??"");
  if(!/^[a-f0-9]{64}$/u.test(expected))
    return respond({ok:false,error:"PREDGE_PILOT_CREDENTIAL_NOT_CONFIGURED",
      chargeable:false},503);
  const raw=request.headers.get("Authorization")??"";
  const token=raw.startsWith("Bearer ")?raw.slice(7):"";
  if(!secureTokenMatch(token,expected))
    return respond({ok:false,error:"PREDGE_PILOT_UNAUTHORIZED",chargeable:false},401);
  if(request.method!=="GET")
    return respond({ok:false,error:"METHOD_NOT_ALLOWED",chargeable:false},405);
  if(!Number.isSafeInteger(now)||now<0||!env?.DB?.batch)
    return respond({ok:false,error:"PREDGE_PILOT_D1_UNAVAILABLE",chargeable:false},503);
  const query=new URL(request.url).searchParams;
  if([...query.keys()].some(k=>k!=="domain")||
    query.getAll("domain").length>1||
    (query.has("domain")&&!["geopolitics","macro","rare_earth"].includes(query.get("domain"))))
    return respond({ok:false,error:"PREDGE_PILOT_QUERY_INVALID",chargeable:false},400);
  // No credential/IP in database: only bounded 6-hex hash bucket, atomic D1
  // per-client and global consumption; fail closed on unavailable governor.
  let decision;
  try{
    decision=await consumeCentralSecurityBudget(env.DB,{
      route_class:ROUTE_CLASS,client_key:await keyHash(token)
    },{now});
  }catch{return respond({ok:false,error:"PREDGE_PILOT_RATE_GOVERNOR_UNAVAILABLE",
    chargeable:false},503)}
  if(!decision.allowed)
    return Response.json({ok:false,error:"PREDGE_PILOT_DAILY_LIMIT",
      limit:500,chargeable:false},{status:429,headers:{
        ...HEADERS,"Retry-After":String(decision.retry_after_seconds)
      }});
  const response=await publicSharedDerivedNewsFeed(env,query,now);
  if(response.status!==200)
    return respond({ok:false,error:"PREDGE_PILOT_SHARED_JOURNAL_UNAVAILABLE",
      chargeable:false},503);
  let data;
  try{data=await response.json()}catch{return respond({ok:false,
    error:"PREDGE_PILOT_INVALID_JOURNAL",chargeable:false},503)}
  if(data?.ok!==true||
     data.schema!=="geomacro.derived-news-structural-feed.v1"||
     data.journal_origin!=="SAME_D1_ROWS_AS_GEOMACRO_INTELLIGENCE"||
     data.raw_upstream_delivered!==false||
     data.partner_resale_or_commercial_redistribution_authorized!==false||
     data.commercial_rights_verified!==false||
     data.chargeable!==false||data.payment_required_now!==false||
     !Array.isArray(data.items)||data.items.length>600||
     data.items.some(item=>item?.commercial_derived_rights_verified!==false||
       item?.signed_product_verified!==false||item?.payable!==false||
       item?.raw_upstream_delivered!==false))
    return respond({ok:false,error:"PREDGE_PILOT_SOURCE_CONTRACT_INVALID",
      chargeable:false},503);
  // Do not copy or alter any qualifying original-derived record: same IDs,
  // timestamps and explanations as website + the source-neutral public feed.
  return respond({
    ...data,
    pilot_delivery_schema:SCHEMA,partner:"predge",
    authenticated_partner_delivery:true,
    individually_approved_item_ids_required:false,
    per_record_manual_review_receipt_required:false,
    eligibility_policy:"AUTOMATIC_EXISTING_PUBLIC_DERIVED_D1_JOURNAL",
    research_pilot_scope_only:true,
    downstream_commercial_redistribution_authorized:false,
    separate_signed_risk_gate_or_gro_verified:false,
    max_requests_per_utc_day:500,
    suggested_requests_per_utc_day:100,
    requests_are_chargeable:false,
  },200);
}
