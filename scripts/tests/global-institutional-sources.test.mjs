import test from "node:test";
import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
import {buildInstitutionalSourceReport,probeInstitutionalCandidate} from "../ops/discover-global-institutional-sources.mjs";
import {buildRiskStreamDualAudience,validRiskStreamDualAudience} from "../../workers/control-plane/src/risk-stream-dual-audience.mjs";
import {deriveRiskStreamEligibleScore} from "../../workers/control-plane/src/risk-stream-pipeline.mjs";

const now=new Date("2026-11-18T12:00:00.000Z");
function entry(source_id,domain,parent,role,category){
 return {source_id,publisher_root_domain:domain,parent_media_entity:parent,source_role:role,
  categories:[category],status:"APPROVED",rights_evidence:{licence_url:"https://example.org/license",
   terms_url:"https://example.org/terms",reviewed_at:"2026-11-17T00:00:00.000Z",
   reviewer:"rights-reviewer",notes:"Verified explicit public reuse license and source terms."},
  rights_expire_at:"2027-11-17"};
}
const official={source_id:"official_wire",url:"https://official.example/feed",format:"rss",
 category:"GEOPOLITICS",source_role:"GOVERNMENT_WIRE",publisher_root_domain:"official.example",
 parent_media_entity:"official_government",pillar:"sanctions"};
const regional={source_id:"regional_wire",url:"https://regional.example/feed",format:"rss",
 category:"GEOPOLITICS",source_role:"INDEPENDENT_REGIONAL",publisher_root_domain:"regional.example",
 parent_media_entity:"regional_outlet",pillar:"independent"};
const timestamp="2026-11-18T11:00:00.000Z";
const healthy=(source_id)=>({source_id,health_status:"WORKING",http_status:200,
 last_successful_http_fetch_at:timestamp,last_source_native_publication_at:timestamp,failure_reason:null});

test("protected source registry apply consumes only the live rights-filtered manifest",()=>{
 const workflow=readFileSync(".github/workflows/apply-risk-stream-source-registry.yml","utf8");
 assert.ok(workflow.includes("discover-global-institutional-sources.mjs --probe"));
 assert.ok(workflow.includes("--eligible-manifest artifacts/global-institutional-sources/eligible-rights-manifest.json"));
 assert.ok(workflow.includes("register-risk-stream-source.mjs --apply --manifest artifacts/global-institutional-sources/eligible-rights-manifest.json"));
 assert.ok(workflow.includes("APPLY_RISK_STREAM_SOURCE_REGISTRY_PRODUCTION"));
});

test("institutional source audits use only the shared three-category taxonomy",()=>{
 const report=buildInstitutionalSourceReport({candidates:[official],rightsEntries:[],
  probes:[healthy(official.source_id)],now});
 const candidate=report.candidates[0];
 assert.equal(candidate.topic_taxonomy_version,"global-risk-query-taxonomy.v1");
 assert.equal(typeof candidate.discovery_topic_bucket_id,"string");
 assert.ok(candidate.discovery_topic_tags.includes("sanctions") ||
  candidate.discovery_topic_tags.includes("armed_conflict"));
 assert.equal(candidate.commercial_rights_approved,0);
 assert.deepEqual(Object.keys(report.role_pairs).sort(),
  ["CRITICAL_MINERALS","GEOPOLITICS","MACRO_FX"]);
});

test("HTTP 200 on an unreviewed source remains private and redacted",()=>{
 const candidate={...official,source_id:"unreviewed_wire"};
 const report=buildInstitutionalSourceReport({candidates:[candidate],rightsEntries:[],
  probes:[healthy(candidate.source_id)],now});
 const row=report.candidates[0];
 assert.equal(row.commercial_rights_approved,0);
 assert.equal(row.lane,"PRIVATE_OSINT_REDACTED_CORROBORATION");
 assert.equal(row.raw_source_redacted,true);
 assert.equal(row.licensed_source_text_included,false);
 assert.equal(row.registry_sync_eligible,false);
});

test("eligible global role pair requires distinct domains and parent entities",()=>{
 const rights=[entry(official.source_id,official.publisher_root_domain,official.parent_media_entity,
  official.source_role,official.category),entry(regional.source_id,regional.publisher_root_domain,
  regional.parent_media_entity,regional.source_role,regional.category)];
 const report=buildInstitutionalSourceReport({candidates:[official,regional],rightsEntries:rights,
  probes:[healthy(official.source_id),healthy(regional.source_id)],now});
 assert.equal(report.role_pairs.GEOPOLITICS.ready,true);
 assert.equal(report.approved_registry_sync_count,2);
 assert.equal(report.eligible_manifest.entries.length,2);
 assert.throws(()=>buildInstitutionalSourceReport({candidates:[official,{...regional,
  publisher_root_domain:official.publisher_root_domain}],rightsEntries:[
   rights[0],entry(regional.source_id,official.publisher_root_domain,regional.parent_media_entity,
    regional.source_role,regional.category)],probes:[healthy(official.source_id),healthy(regional.source_id)],now}),
  /ROLE_PAIR_NOT_INDEPENDENT_GEOPOLITICS/u);
});

test("native timestamps and parser success are required for registry sync eligibility",()=>{
 const rights=[entry(official.source_id,official.publisher_root_domain,official.parent_media_entity,
  official.source_role,official.category)];
 const report=buildInstitutionalSourceReport({candidates:[official],rightsEntries:rights,
  probes:[{...healthy(official.source_id),last_source_native_publication_at:null}],now});
 assert.equal(report.candidates[0].registry_sync_eligible,false);
 assert.equal(report.approved_registry_sync_count,0);
});

test("RSS live probe records health metadata and not publisher text",async()=>{
 const xml='<?xml version="1.0"?><rss version="2.0"><channel><item><title>Private raw title</title><pubDate>Tue, 18 Nov 2026 11:00:00 GMT</pubDate></item></channel></rss>';
 const candidate={...official};
 const result=await probeInstitutionalCandidate(candidate,{now,fetchImpl:async url=>{
  assert.equal(url,candidate.url);
  return new Response(xml,{status:200,headers:{"content-type":"application/rss+xml"}});
 }});
 assert.equal(result.health_status,"WORKING");
 assert.equal(result.last_source_native_publication_at,timestamp);
 assert.equal(JSON.stringify(result).includes("Private raw title"),false);
});

test("ReliefWeb JSON API uses its native created timestamp",async()=>{
 const candidate={source_id:"un_reliefweb_api_ccby",url:"https://api.reliefweb.int/v1/reports",
  format:"json_reliefweb",category:"GEOPOLITICS",source_role:"INDEPENDENT_REGIONAL",
  publisher_root_domain:"reliefweb.int",parent_media_entity:"un_ocha_reliefweb"};
 const body={data:[{fields:{date:{created:timestamp}}}]};
 const result=await probeInstitutionalCandidate(candidate,{now,fetchImpl:async()=>new Response(
  JSON.stringify(body),{status:200,headers:{"content-type":"application/json"}})});
 assert.equal(result.health_status,"WORKING");
 assert.equal(result.last_source_native_publication_at,timestamp);
});

test("risk pipeline derives named corridor and price assets from structural event text",()=>{
 const result=deriveRiskStreamEligibleScore("GEOPOLITICS","USA",
  "CHOKEPOINT DISRUPTION AROUND HORMUZ PUTS BRENT CRUDE OIL AND LNG ROUTES AT RISK",
  {eligibleTiers:["standard"]});
 assert.ok(result);
 assert.deepEqual(result.agent_decision.strategic_corridors,["HORMUZ"]);
 for(const asset of ["brent_crude","lng_spot","freight_rates","shipping_routes"])
  assert.ok(result.agent_decision.affected_assets.includes(asset));
 assert.equal(result.agent_decision.tier,"STANDARD");
 assert.equal(result.agent_decision.upgrade_available,false);
});

test("dual audience enriches assets for corridor and explicit market signals without exposing input text",()=>{
 const value=buildRiskStreamDualAudience({category:"GEOPOLITICS",eventClass:"MARITIME_CHOKEPOINT_DISRUPTION",
  score:72,confidence:.86,horizonHours:72,tier:"STANDARD",corroborationReady:false,
  strategicCorridors:["HORMUZ","RED_SEA","MALACCA","PANAMA","SUEZ","BAB_EL_MANDEB","TAIWAN_STRAIT","SOUTH_CHINA_SEA","BLACK_SEA","BOSPORUS","MOZAMBIQUE_CHANNEL","CAPE_OF_GOOD_HOPE"],affectedAssets:["usd_inr","lithium"],contagionCorridors:["IRN>ARE"]});
 assert.equal(validRiskStreamDualAudience(value),true);
 assert.equal(value.agent_decision.strategic_corridors.length,12);
 assert.ok(value.agent_decision.strategic_corridors.includes("HORMUZ"));
 for(const asset of ["brent_crude","lng_spot","freight_rates","usd_inr","lithium"])
  assert.ok(value.agent_decision.affected_assets.includes(asset));
 assert.equal(value.agent_decision.upgrade_available,false);
 assert.equal(value.raw_source_redacted,true);
 assert.equal(value.licensed_source_text_included,false);
 assert.throws(()=>buildRiskStreamDualAudience({category:"MACRO_FX",affectedAssets:["raw_publisher_title"]}),
  /RISK_STREAM_DUAL_AUDIENCE_INVALID/u);
});
