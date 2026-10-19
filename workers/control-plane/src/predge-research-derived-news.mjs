/**
 * Predge's private, free, non-commercial 90-day research feed. This is the
 * exact same source-neutral 72h D1 projection delivered to Geomacro
 * Intelligence: zero per-item approvals, zero second store or ingestion.
 *
 * A domain-separated, one-purpose Bearer token can be derived only in the
 * protected deploy job from the EXISTING GitHub secret. NEVER give Predge
 * the control-plane/admin token or the root ledger secret.
 *
 * This endpoint NEVER grants source rights, partner resale, GRO signing,
 * score, funds, risk-gate decisions, or trading authorization.
 */
import {publicSharedDerivedNewsFeed} from "./shared-derived-news-feed.mjs";

export const PREDGE_RESEARCH_PILOT_END_UTC="2027-01-17T00:00:00.000Z";
const HEADERS={"Cache-Control":"private, no-store","Pragma":"no-cache",
  "Vary":"Authorization","X-Content-Type-Options":"nosniff",
  "Referrer-Policy":"no-referrer"};
const fail=(error,status)=>Response.json({ok:false,error,chargeable:false,
  partner_redistribution_authorized:false},{status,headers:HEADERS});
function equalsToken(value,expected){
  if(typeof value!=="string"||typeof expected!=="string"||
     !/^[a-f0-9]{64}$/.test(expected)||value.length!==expected.length)return false;
  // Fixed-size 64-byte hex strings only, no network, no early byte exit.
  let diff=0;
  for(let i=0;i<expected.length;i++)diff|=value.charCodeAt(i)^expected.charCodeAt(i);
  return diff===0;
}
export async function predgeResearchDerivedNewsFeed(
  request,env,now=Date.now(),
){
  if(!Number.isFinite(now))return fail("PREDGE_RESEARCH_CLOCK_INVALID",503);
  const expected=env?.PREDGE_RESEARCH_NEWS_TOKEN;
  if(typeof expected!=="string"||!/^[a-f0-9]{64}$/.test(expected))
    return fail("PREDGE_RESEARCH_AUTH_UNCONFIGURED",503);
  // The research pilot does NOT become a perpetual commercial license:
  // this upper-bound expires 90 days after the proposed Oct 19 kickoff.
  // If the signed kickoff differs, a reviewed code/config change is required.
  if(now>=Date.parse(PREDGE_RESEARCH_PILOT_END_UTC))
    return fail("PREDGE_RESEARCH_PILOT_WINDOW_EXPIRED",403);
  const authorization=request.headers.get("authorization");
  const match=typeof authorization==="string"&&
    /^Bearer [a-f0-9]{64}$/.test(authorization)&&
    equalsToken(authorization.slice(7),expected);
  if(!match)return fail("PREDGE_RESEARCH_UNAUTHORIZED",401);
  const url=new URL(request.url);
  // Only the existing exact domain filter is allowed; token and IDs NEVER
  // enter URL query parameters, and per-item allowlists are deliberately gone.
  const upstream=await publicSharedDerivedNewsFeed(env,url.searchParams,now);
  const status=upstream.status;
  let body;
  try{body=await upstream.json()}catch{return fail("PREDGE_RESEARCH_D1_UNAVAILABLE",503)}
  if(status!==200){
    return fail(status===400?"PREDGE_RESEARCH_QUERY_INVALID":"PREDGE_RESEARCH_D1_UNAVAILABLE",
      status===400?400:503);
  }
  if(body?.ok!==true||body.schema!=="geomacro.derived-news-structural-feed.v1"||
     body.journal_origin!=="SAME_D1_ROWS_AS_GEOMACRO_INTELLIGENCE"||
     body.partner_resale_or_commercial_redistribution_authorized!==false||
     body.commercial_rights_verified!==false||body.chargeable!==false||
     body.raw_upstream_delivered!==false||!Array.isArray(body.items)||
     body.items.length>600||Object.keys(body.counts??{}).sort().join(",")!==
       "geopolitics,macro,rare_earth")
    return fail("PREDGE_RESEARCH_CONTRACT_UNAVAILABLE",503);
  if(body.items.some(item=>item?.commercial_derived_rights_verified!==false||
       item?.signed_product_verified!==false||item?.payable!==false||
       item?.raw_upstream_delivered!==false))
    return fail("PREDGE_RESEARCH_RECORD_NOT_ALLOWED",503);
  return Response.json({...body,
    partner_delivery_schema:"geomacro.predge.research-news-delivery.v1",
    partner:"predge",partner_delivery_scope:"PRIVATE_NONCOMMERCIAL_RESEARCH_PILOT",
    authentication:"DEDICATED_BEARER_ONLY",
    data_reuse:"EXACT_SAME_PUBLIC_ELIGIBLE_D1_JOURNAL_ITEMS",
    per_item_approval_ids_required:false,
    per_item_partner_scope_receipts_required:false,
    per_item_rights_review_receipts_required_for_research:false,
    source_licensing_waived:false,owner_grant_of_upstream_rights:false,
    risk_gate_decision_included:false,gro_signed:false,
    execution_authorized:false,partner_resale_or_commercial_redistribution_authorized:false,
    maximum_pilot_scope_expires_at:PREDGE_RESEARCH_PILOT_END_UTC,
    source_credits_needing_attribution_still_withheld:true,
  },{status:200,headers:HEADERS});
}
