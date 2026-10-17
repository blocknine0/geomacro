import {createHash} from "node:crypto";
import {PUBLIC_FEED_ROTATION} from "../ops/observe-operator-free-feed-rotation.mjs";

/**
 * #2170: Actual production evidence reconciliation, not catalogue promotion.
 * The 1059 number counts DOMAIN/LANE references, not distinct RSS/API feeds.
 * This audit reuses only EXISTING bounded provider observations; never sends
 * new requests, exposes provider identities or changes rights/payment.
 */
const DOMAINS=["GEOPOLITICS","MACRO","CRITICAL_MINERALS"];
const STATUS=new Set(["LIVE_PRIVATE_METADATA","HTML_HEALTH_ONLY",
  "NETWORK_OR_REDIRECT_UNAVAILABLE","DENIED_OR_RATE_LIMIT",
  "HTTP_UNAVAILABLE","FORMAT_NOT_VERIFIED","BODY_SIZE_LIMIT",
  "EMPTY_BODY","INVALID_RESPONSE","NOT_ATTEMPTED"]);
const MAX_AGE_MS=12*60*60*1000;
const MAX_FUTURE_MS=5*60*1000;
const sha=s=>createHash("sha256").update(s).digest("hex").slice(0,32);
const fail=()=>{throw Error("GEOMACRO_ACTIVATION_PROOF_INVALID");};
const int=n=>Number.isSafeInteger(n)&&n>=0;
const normalize={
  geopolitics:"GEOPOLITICS",macro:"MACRO",rare_earth:"CRITICAL_MINERALS",
  macro_fx:"MACRO",critical_minerals:"CRITICAL_MINERALS",
};
const MODE={xml:"ORIGINAL_FEED_METADATA_NOT_ARTICLE_VERIFIED",
  json:"API_PERIOD_DATA_NOT_FEED",html:"HTML_CONTEXT_ONLY_NOT_FEED"};
const INELIGIBLE_STATES=[
  "TELEGRAM_CANDIDATE_NOT_AUTHORIZED",
  "HISTORICAL_EVIDENCE_NOT_CURRENT_EVENT",
  "EXISTING_FAMILY_REUSE_NO_NEW_POLLER",
  "OPERATOR_CANDIDATE_UNVERIFIED_OR_HELD",
];
const acceptedSourceId=/^[a-z0-9][a-z0-9_.:-]{0,179}$/;
function expectedSourceRef(id,domain){
  return sha("operator76:"+domain+":"+id);
}
export function auditGeomacro1059FeedActivation({
  inventory,operatorCatalog,rotationReceipts=[],now=new Date(),
}={}){
  if(inventory?.schema!=="geomacro.private-all-source-intake-inventory.v1"||
     !Array.isArray(inventory?.source_refs)||
     !int(inventory.sources_catalogued)||
     inventory.sources_catalogued!==inventory.source_refs.length||
     !operatorCatalog||operatorCatalog.schema!==
       "geomacro.operator-source-attribution-intake.v1"||
     !Array.isArray(operatorCatalog.entries)||
     rotationReceipts.length>3||!Array.isArray(rotationReceipts)||
     !(now instanceof Date)||!Number.isFinite(now.getTime()))
    fail();
  const inv=new Map();
  const statusCounts=Object.create(null);
  const perDomain=Object.fromEntries(DOMAINS.map(d=>[d,{
    catalogued:0,active_feed_reference_slots:0,
    feed_native_24h_reference_slots:0,
    registered_does_not_imply_live:true,
  }]));
  for(const ref of inventory.source_refs){
    if(!ref||typeof ref!=="object"||
       !/^[a-f0-9]{32}$/.test(ref.source_ref)||
       !DOMAINS.includes(ref.domain)||typeof ref.lane!=="string"||
       typeof ref.status!=="string"||inv.has(ref.source_ref))
      fail();
    inv.set(ref.source_ref,ref);
    statusCounts[ref.status]=(statusCounts[ref.status]||0)+1;
    perDomain[ref.domain].catalogued++;
  }
  const catalog=new Map();
  for(const item of operatorCatalog.entries){
    if(!acceptedSourceId.test(item?.id??"")||catalog.has(item.id))
      fail();
    catalog.set(item.id,item);
  }
  const receipts=new Map();
  const liveFeeds=[];
  const degraded=[];
  for(const batch of rotationReceipts){
    const at=Date.parse(batch?.checked_at??"");
    if(batch?.schema!=="geomacro.operator-free-rotating-private-feed-metadata.v1"||
       !int(batch.group)||batch.group>2||receipts.has(batch.group)||
       batch.groups_total!==3||
       !Number.isFinite(at)||at>now.getTime()+MAX_FUTURE_MS||
       now.getTime()-at>MAX_AGE_MS||
       !Array.isArray(batch.sources)||
       batch.source_count!==batch.sources.length||
       batch.http_requests!==batch.source_count||
       batch.raw_publisher_payload_persisted!==false||
       batch.signed_gro_generated!==false||
       batch.supabase_requests!==0||batch.b2_requests!==0||
       batch.d1_requests!==0||batch.payments!==0)
      fail();
    const groupSources=PUBLIC_FEED_ROTATION.filter(x=>x.group===batch.group);
    if(groupSources.length!==batch.sources.length)fail();
    const observed=new Map();
    for(const row of batch.sources){
      if(!acceptedSourceId.test(row?.id??"")||observed.has(row.id)||
         !STATUS.has(row.transport_state)||
         row.request_attempted!==true||row.http_requests!==1||
         !int(row.sampled_metadata_items)||
         row.sampled_metadata_items>40||
         !(row.native_dated_24h_items===null||
           (int(row.native_dated_24h_items)&&
             row.native_dated_24h_items<=row.sampled_metadata_items))||
         row.commercial_eligible!==false||
         row.current_scored_intelligence_verified!==false||
         row.signed_gro!==false||
         row.source_rights_verified_for_commerce!==false||
         row.customer_raw_data_delivered!==false)
        fail();
      observed.set(row.id,row);
    }
    for(const feed of groupSources){
      const row=observed.get(feed.id);
      const registered=catalog.get(feed.id);
      if(!row||!registered||
         registered.runtime_state!=="SCHEDULED_BOUNDED_PRIVATE_REVIEW"||
         registered.canonical_existing_id!==null||
         !Array.isArray(registered.domains)||registered.domains.length===0||
         !Array.isArray(row.domains)||
         JSON.stringify([...row.domains].sort())!==
           JSON.stringify([...registered.domains].sort())||
         row.rights_status!=="REQUIRES_EXACT_DATASET_COMMERCIAL_REVIEW")
        fail();
      const eligibleRefs=registered.domains.map(domain=>{
        const mapped=normalize[domain];
        if(!mapped)fail();
        const ref=inv.get(expectedSourceRef(feed.id,mapped));
        if(!ref||ref.lane!=="operator76"||
           ref.domain!==mapped||
           ref.status!=="READ_ONLY_CANDIDATE_TRANSPORT_NOT_COMMERCIAL")
          fail();
        return mapped;
      });
      // Active XML transport means only: bounded parser recognized at least
      // one genuine RSS/Atom entry. Feed item timestamps can be "updated",
      // NOT original publisher page clocks; all commercial gates remain off.
      const active=feed.format==="xml"&&
        row.transport_state==="LIVE_PRIVATE_METADATA"&&
        row.sampled_metadata_items>0&&
        row.timestamp_precision==="FEED_ITEM_DATE_NOT_ORIGINAL_PUBLISHER_PAGE_VALIDATION";
      const recent=active&&
        int(row.native_dated_24h_items)&&row.native_dated_24h_items>0;
      if(active){
        liveFeeds.push(feed.id);
        for(const d of eligibleRefs){
          perDomain[d].active_feed_reference_slots++;
          if(recent)perDomain[d].feed_native_24h_reference_slots++;
        }
      }else degraded.push(feed.id);
    }
    receipts.set(batch.group,{at});
  }
  const count=inventory.sources_catalogued;
  const target=Math.ceil(count*.8);
  const permanentlyNonFeed=INELIGIBLE_STATES.reduce(
    (n,key)=>n+(statusCounts[key]||0),0);
  const provisionallyConvertibleMax=count-permanentlyNonFeed;
  const proven=new Set(liveFeeds).size;
  return Object.freeze({
    schema:"geomacro.private-1059-physical-feed-activation-ledger.v1",
    checked_at:now.toISOString(),
    catalogued_domain_lane_references:count,
    requested_active_feed_target_80pct:target,
    observed_rotating_groups:receipts.size,
    expected_rotating_groups:3,
    complete_operator_xml_probe_rotation:receipts.size===3,
    distinct_live_xml_feed_transports_proven:proven,
    // 1 provider reused for 3 categories is 1 physical feed, not 3.
    reused_category_reference_slots_supported_by_live_xml:
      Object.values(perDomain).reduce((n,x)=>n+x.active_feed_reference_slots,0),
    distinct_xml_feed_candidates_configured:PUBLIC_FEED_ROTATION.filter(
      x=>x.format==="xml").length,
    distinct_other_api_or_html_candidates_configured:PUBLIC_FEED_ROTATION.filter(
      x=>x.format!=="xml").length,
    catalog_references_not_independent_feeds_at_baseline:permanentlyNonFeed,
    max_convertible_reference_slots_without_catalog_reclassification:
      provisionallyConvertibleMax,
    // This ceiling is NOT a possible feed count: most remainder are websites.
    existing_reference_semantics_allow_80pct:
      provisionallyConvertibleMax>=target,
    missing_physical_live_feed_target_count:Math.max(0,target-proven),
    per_domain:perDomain,
    raw_article_ingestion_proven:false,
    first_party_original_publication_verified:false,
    provider_commercial_use_verified:false,
    raw_provider_identity_or_url_disclosed:false,
    all_catalogued_entries_are_active_feeds:false,
    x402_payment_authorized:false,payments:0,
    b2_requests:0,d1_writes:0,supabase_requests:0,
    no_new_upstream_requests:true,
    // Only private non-reversible commitment over which physical IDs
    // were observed. Never expose raw IDs/URLs/provider names in result.
    live_xml_provider_set_sha256:sha([...liveFeeds].sort().join("\n")),
  });
}
