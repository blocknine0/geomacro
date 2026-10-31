/**
 * Private 15m OSINT transport-only three-domain heartbeat.
 * Store a truthful tiny D1 checkpoint from the SAME actually collected source
 * sweep, including healthy zero-new-article cycles. No extra source GET,
 * story fabrication, publisher URL, private article data, PREDGE or payment.
 */
import {createD1ControlPlaneStateClient} from "./d1-control-plane-state.mjs";

export const OSINT_HEARTBEAT_PIPELINE="private_osint_source_15m_heartbeat";
export const OSINT_HEARTBEAT_DOMAINS=Object.freeze(["geopolitics","macro","rare_earth"]);
export const OSINT_HEARTBEAT_SCHEMA="geomacro.private-osint-source-heartbeat.v1";

export function planPrivateOsintHeartbeats(summary,now=new Date()){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
   summary?.configured_categories!==3||
   summary?.configured_country_category_routes!==585||
   summary?.source_endpoints_attempted!==summary?.registered_source_endpoints||
   !Number.isSafeInteger(summary.source_endpoints_attempted)||
   summary.source_endpoints_attempted<1||summary.source_endpoints_attempted>512)
   throw Error("PRIVATE_OSINT_HEARTBEAT_SWEEP_UNVERIFIED");
 const coverage=summary.category_live_source_coverage;
 if(coverage?.schema!=="geomacro.private-osint-category-live-source-coverage.v1"||
    coverage.expected_categories!==3||
    !Array.isArray(coverage.category_coverage)||coverage.category_coverage.length!==3)
   throw Error("PRIVATE_OSINT_HEARTBEAT_CATEGORY_PROOF_UNVERIFIED");
 const checkedAt=now.toISOString(),seen=new Set();
 return coverage.category_coverage.map(c=>{
   if(!OSINT_HEARTBEAT_DOMAINS.includes(c?.category)||seen.has(c.category)||
      ![c.registered,c.checked,c.healthy,c.empty,c.observed,
         c.healthy_distinct_feed_endpoints,c.native_dated_items_in_collector_batch]
        .every(v=>Number.isSafeInteger(v)&&v>=0)||
      c.registered<1||c.checked>c.registered||c.healthy>c.checked||
      c.healthy_distinct_feed_endpoints>c.healthy||
      c.native_dated_items_in_collector_batch>768||
      (c.healthy===0&&c.healthy_distinct_feed_endpoints!==0)||
      (c.healthy>0&&c.healthy_distinct_feed_endpoints===0)||
      !["LIVE_FEED_AND_DATED_ITEMS_THIS_TICK",
        "LIVE_FEED_HEALTHY_NO_MATCHING_DATED_ITEMS",
        "NO_HEALTHY_FEED_THIS_TICK","NO_SOURCE_REGISTERED"].includes(c.status))
     throw Error("PRIVATE_OSINT_HEARTBEAT_CATEGORY_INVALID");
   const healthy=c.healthy_distinct_feed_endpoints>0;
   if((!healthy&&c.status!=="NO_HEALTHY_FEED_THIS_TICK")||
      (healthy&&!(c.status==="LIVE_FEED_AND_DATED_ITEMS_THIS_TICK"||
                    c.status==="LIVE_FEED_HEALTHY_NO_MATCHING_DATED_ITEMS")))
     throw Error("PRIVATE_OSINT_HEARTBEAT_HEALTH_CONTRADICTS");
   seen.add(c.category);
   return Object.freeze({category:c.category,checked_at:checkedAt,
     healthy,checked_feeds:c.checked,registered_feeds:c.registered,
     healthy_distinct_feed_endpoints:c.healthy_distinct_feed_endpoints,
     native_dated_items_in_collector_batch:c.native_dated_items_in_collector_batch,
     source_status:c.status,
     new_events_verified:false,commercial_rights_verified:false,
     signed_intelligence_available:false,chargeable:false});
 }).sort((a,b)=>a.category.localeCompare(b.category));
}

async function resolveCanonicalD1Id(fetchImpl=fetch){
 if(process.env.D1_DATABASE_ID)return;
 const account=String(process.env.CLOUDFLARE_ACCOUNT_ID??"").trim();
 const token=String(process.env.CLOUDFLARE_API_TOKEN??"").trim();
 if(!account||!token)throw Error("PRIVATE_OSINT_HEARTBEAT_D1_ACCESS_MISSING");
 const r=await fetchImpl("https://api.cloudflare.com/client/v4/accounts/"+
   encodeURIComponent(account)+"/d1/database?per_page=50",{
   headers:{authorization:"Bearer "+token},redirect:"error",
   signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw Error("PRIVATE_OSINT_HEARTBEAT_D1_DISCOVERY_UNAVAILABLE");
 const doc=await r.json();
 const match=doc?.result?.filter(x=>x?.name==="geomacro-control-plane"&&
   /^[a-f0-9-]{20,}$/i.test(String(x.uuid??"")));
 if(doc?.success!==true||match?.length!==1)
   throw Error("PRIVATE_OSINT_HEARTBEAT_D1_NOT_CANONICAL");
 process.env.D1_DATABASE_ID=match[0].uuid;
}
export async function persistPrivateOsintHeartbeats({summary,now=new Date(),
 createClient=createD1ControlPlaneStateClient,fetchImpl=fetch}={}){
 const plan=planPrivateOsintHeartbeats(summary,now);
 if(createClient===createD1ControlPlaneStateClient)
   await resolveCanonicalD1Id(fetchImpl);
 const client=createClient({pipeline:OSINT_HEARTBEAT_PIPELINE});
 const previous=await client.loadRows();
 const updated=[];
 for(const row of plan){
   const older=previous.get(row.category)?.last_attempt_at;
   if(older&&Number.isFinite(Date.parse(older))&&Date.parse(older)>now.getTime())
     throw Error("PRIVATE_OSINT_HEARTBEAT_OUT_OF_ORDER");
   await client.persist(row.category,{
     schema:OSINT_HEARTBEAT_SCHEMA,...row,
     cursor:{status:row.healthy?"OBSERVED":"DEGRADED"}
   },{last_attempt_at:row.checked_at,
     last_success_at:row.healthy?row.checked_at:null});
   updated.push(row);
 }
 const check=await client.loadRows();
 for(const row of updated){
   const stored=check.get(row.category);
   if(stored?.last_attempt_at!==row.checked_at||
      stored?.last_success_at!==(row.healthy?row.checked_at:null)||
      stored?.payload?.schema!==OSINT_HEARTBEAT_SCHEMA||
      stored?.payload?.healthy!==row.healthy||
      stored?.payload?.checked_at!==row.checked_at||
      stored?.payload?.healthy_distinct_feed_endpoints!==row.healthy_distinct_feed_endpoints||
      stored?.payload?.native_dated_items_in_collector_batch!==row.native_dated_items_in_collector_batch)
      throw Error("PRIVATE_OSINT_HEARTBEAT_D1_READBACK_UNVERIFIED");
 }
 return Object.freeze({
   schema:"geomacro.private-osint-source-heartbeat-receipt.v1",
   status:"D1_EXACT_TRANSPORT_READBACK_VERIFIED",
   checked_at:now.toISOString(),
   per_category:Object.fromEntries(updated.map(r=>[r.category,{
     source_transport_healthy:r.healthy,healthy_distinct_feeds:r.healthy_distinct_feed_endpoints,
     native_dated_items_in_collector_batch:r.native_dated_items_in_collector_batch
   }])),
   healthy_categories:updated.filter(r=>r.healthy).length,
   d1_checkpoints_verified:updated.length,
   new_events_verified:false,rights_verified:false,payments:0,
   predge_modified:false
 });
}
