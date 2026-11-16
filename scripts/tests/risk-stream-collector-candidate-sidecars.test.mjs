import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {generateKeyPairSync,sign} from "node:crypto";
import {collectRiskStreamFeedExtensions} from "../ops/collect-risk-stream-feed-extensions.mjs";
import {emitRiskStreamCandidates} from "../ops/emit-risk-stream-candidates.mjs";
import {riskStreamOriginalClaims} from "../../workers/control-plane/src/risk-stream-pipeline.mjs";
import {normalizeRiskStreamInternalCorroboration} from "../../workers/control-plane/src/risk-stream-internal-corroboration.mjs";

const manifest=JSON.parse(readFileSync("config/risk-stream-source-rights-reviewed.v1.json","utf8"));
const source=manifest.entries.find(row=>row.source_id==="uk_fcdo_ogl_official_atom");
const now=Date.parse("2026-11-15T10:00:00.000Z");
const sourceRegistry=manifest.entries.filter(row=>row.status==="APPROVED")
 .map(row=>({...row,enabled:1,commercial_rights_approved:1}));
const original={category:"GEOPOLITICS",country_iso3:"GBR",feed_origin:"RSS",
 source_id:source.source_id,source_role:source.source_role,
 publisher_root_domain:source.publisher_root_domain,parent_media_entity:source.parent_media_entity,
 source_url:"https://www.gov.uk/government/news/official-measure",
 published_at:"2026-11-15T09:30:00.000Z",
 event_identity:{country_iso3:"GBR",event_type:"sanctions_policy",actor_id:"uk_foreign_office",
  target_id:"sanctions_subject",location_id:"london",occurred_at:"2026-11-15T09:00:00.000Z"},
 raw_payload:`First-party factual item. Open Government Licence v3 ${source.rights_evidence.licence_url}`,
 item_license_evidence:{license_id:"UK_OGL_V3",license_url:source.rights_evidence.licence_url,
  terms_url:source.rights_evidence.terms_url,item_url:"https://www.gov.uk/government/news/official-measure",
  item_license_marker:"Open Government Licence v3",publisher_owned_content_only:true,
  third_party_exceptions:false,non_commercial:false,restricted_material:false,
  factual_record_only:true,original_text_republished:false},
 reporting_position:"confirms",
 derived:{what:"A government measure changes external access.",
  why:"The change affects a defined policy exposure.",
  market:"Affected counterparties may face new constraints.",
  watch:"Track implementation and any formal revisions."}};
const candidateXml=`<feed xmlns:gm="https://geomacro.live/ns/risk-stream/1"><entry><gm:geomacro_risk_stream_candidate>${JSON.stringify(original).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")}</gm:geomacro_risk_stream_candidate></entry></feed>`;
const feed=(name=source.source_id)=>({name,url:"https://www.gov.uk/government/organisations/foreign-commonwealth-development-office.atom",
 source_type:"official",risk_category:"conflict",risk_stream_item_licensed:true,
 risk_stream_standard_item_license_candidate:true});
const fetchFixture=async(_url,options)=>({ok:true,text:async()=>{
 assert.equal(options.redirect,"error");return candidateXml;
}});

for(const collector of ["direct","private"]){
 test(`${collector} scheduled collector writes an item-licensed candidate accepted by the handoff`,async()=>{
  const result=await collectRiskStreamFeedExtensions({collector,now,fetchImpl:fetchFixture,
   rightsManifest:manifest,feeds:{schema:"geomacro.unified-rss-feed-registry.v1",sources:[feed()]},sourceRegistry});
  assert.equal(result.status,"ITEM_LICENSE_VERIFIED_CANDIDATES_READY");
  assert.equal(result.originals.length,1);
  const admission=await emitRiskStreamCandidates({originals:result.originals,sourceRegistry,
   rightsManifest:manifest,now,dryRun:true});
  assert.equal(admission.status,"DRY_RUN");
  assert.equal(admission.candidate_count,1);
  assert.equal(admission.item_license_skipped,0);
 });
}

test("collector normalizes the Antarctica code to the sovereign Australia route before attestation",async()=>{
 const antarctica={...original,country_iso3:"ATA",
  event_identity:{...original.event_identity,country_iso3:"ATA"}};
 const xml='<feed xmlns:gm="https://geomacro.live/ns/risk-stream/1"><entry><gm:geomacro_risk_stream_candidate>'+JSON.stringify(antarctica).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")+'</gm:geomacro_risk_stream_candidate></entry></feed>';
 const result=await collectRiskStreamFeedExtensions({collector:"direct",now,
  fetchImpl:async()=>({ok:true,text:async()=>xml}),rightsManifest:manifest,
  feeds:{schema:"geomacro.unified-rss-feed-registry.v1",sources:[feed()]},sourceRegistry});
 assert.equal(result.originals.length,1);
 assert.equal(result.originals[0].country_iso3,"AUS");
 assert.equal(result.originals[0].event_identity.country_iso3,"AUS");
});

test("metadata-only or non-opted-in feeds cannot produce a Risk Stream sidecar",async()=>{
 const noExtension=await collectRiskStreamFeedExtensions({collector:"direct",now,
  fetchImpl:async()=>({ok:true,text:async()=>"<feed><entry><title>ordinary headline</title></entry></feed>"}),
  rightsManifest:manifest,feeds:{schema:"geomacro.unified-rss-feed-registry.v1",sources:[feed()]},sourceRegistry});
 assert.equal(noExtension.status,"NO_ITEM_LICENSE_VERIFIED_CANDIDATES");
 assert.equal(noExtension.originals.length,0);
 const notOptedIn=await collectRiskStreamFeedExtensions({collector:"private",now,
  fetchImpl:async()=>{throw Error("must not fetch unapproved feed")},rightsManifest:manifest,
  feeds:{schema:"geomacro.unified-rss-feed-registry.v1",sources:[{...feed(),risk_stream_item_licensed:false}]},sourceRegistry});
 assert.equal(notOptedIn.originals.length,0);
});

test("ordinary Atom entries derive guarded sidecars from entry fields and the linked page license",async()=>{
 const ordinary=`<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>tag:gov.uk,2026:news/123</id>
  <title>UK announces new sanctions policy for Russia</title><updated>2026-11-15T09:30:00Z</updated>
  <link rel="alternate" href="https://www.gov.uk/government/news/sanctions-policy-russia"/>
  <summary>New sanctions policy announcement relating to Russia.</summary></entry></feed>`;
 const page=`<html><footer><a href="${source.rights_evidence.licence_url}" rel="license">Open Government Licence v3.0</a>
  <a href="${source.rights_evidence.terms_url}">Terms</a></footer></html>`;
 const result=await collectRiskStreamFeedExtensions({collector:"direct",now,fetchImpl:async(url,options)=>{
  assert.equal(options.redirect,"error");
  return {ok:true,text:async()=>url.endsWith(".atom")?ordinary:page,
   headers:{get:()=>null}};
 },rightsManifest:manifest,feeds:{schema:"geomacro.unified-rss-feed-registry.v1",sources:[feed()]},sourceRegistry});
 assert.equal(result.originals.length,1);
 assert.equal(result.counts.standard_entries_seen,1);
 assert.equal(result.counts.standard_candidates_built,1);
 assert.equal(result.originals[0].country_iso3,"RUS");
 assert.equal(result.originals[0].category,"GEOPOLITICS");
 assert.equal(result.originals[0].source_id,source.source_id);
 assert.match(result.originals[0].raw_payload,/Open Government Licence v3\.0/u);
 const admitted=await emitRiskStreamCandidates({originals:result.originals,sourceRegistry,
  rightsManifest:manifest,now,dryRun:true});
 assert.equal(admitted.item_license_skipped,0);
});

test("standard Atom items with item-level restrictions or no license evidence are rejected",async()=>{
 const ordinary=`<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>tag:x,1</id>
  <title>Sanctions policy for Russia</title><updated>2026-11-15T09:30:00Z</updated>
  <link href="https://www.gov.uk/government/news/sanctions-policy-russia"/></entry></feed>`;
 for(const page of ["<html>Non-commercial item</html>","<html>No license marker</html>",
  `<html><a href="${source.rights_evidence.licence_url}" rel="license">Open Government Licence v3.0</a> all rights reserved</html>`]){
  const result=await collectRiskStreamFeedExtensions({collector:"private",now,fetchImpl:async(url)=>({ok:true,
   text:async()=>url.endsWith(".atom")?ordinary:page,headers:{get:()=>null}}),rightsManifest:manifest,
   feeds:{schema:"geomacro.unified-rss-feed-registry.v1",sources:[feed()]},sourceRegistry});
  assert.equal(result.originals.length,0);
 }
});

test("standard JSON Feed items use published link and timestamp fields without an upstream extension",async()=>{
 const jsonFeed=JSON.stringify({version:"https://jsonfeed.org/version/1.1",items:[{
  id:"policy-record-77",url:"https://www.gov.uk/government/news/sanctions-russia",
  title:"UK sanctions policy for Russia",date_published:"2026-11-15T09:30:00Z",
  summary:"Sanctions policy update relating to Russia."}]});
 const page=`<a rel="license" href="${source.rights_evidence.licence_url}">Open Government Licence v3.0</a>`;
 const result=await collectRiskStreamFeedExtensions({collector:"direct",now,fetchImpl:async(url)=>({ok:true,
  text:async()=>url.endsWith(".atom")?jsonFeed:page,headers:{get:()=>null}}),rightsManifest:manifest,
  feeds:{schema:"geomacro.unified-rss-feed-registry.v1",sources:[feed()]},sourceRegistry});
 assert.equal(result.originals.length,1);
 assert.equal(result.originals[0].country_iso3,"RUS");
 assert.equal(result.originals[0].source_id,source.source_id);
 assert.equal(result.originals[0].feed_origin,"OFFICIAL_API");
 const restricted=JSON.stringify({items:[{id:"policy-record-78",url:"https://www.gov.uk/government/news/sanctions-russia",
  title:"UK sanctions policy for Russia",date_published:"2026-11-15T09:30:00Z",license:"CC BY-NC"}]});
 const skipped=await collectRiskStreamFeedExtensions({collector:"direct",now,fetchImpl:async(url)=>({ok:true,
  text:async()=>url.endsWith(".atom")?restricted:page,headers:{get:()=>null}}),rightsManifest:manifest,
  feeds:{schema:"geomacro.unified-rss-feed-registry.v1",sources:[feed()]},sourceRegistry});
 assert.equal(skipped.originals.length,0);
});

test("private collector adds only redacted corroboration features at dual attestation",async()=>{
 const result=await collectRiskStreamFeedExtensions({collector:"private",now,fetchImpl:fetchFixture,
  rightsManifest:manifest,feeds:{schema:"geomacro.unified-rss-feed-registry.v1",sources:[feed()]},sourceRegistry});
 const facts=generateKeyPairSync("ed25519"),rights=generateKeyPairSync("ed25519");
 const context=normalizeRiskStreamInternalCorroboration({source_kind:"TELEGRAM_WATCH",country_iso3:"GBR",
  category:"GEOPOLITICS",text:"Sanctions watch secret channel quote https://t.me/private/1",
  severity_weight:30,corroboration_weight:.15,corridors:["GBR>USA"]});
 const posted=[];
 const output=await emitRiskStreamCandidates({originals:result.originals,sourceRegistry,
  rightsManifest:manifest,now,dryRun:false,controlPlaneUrl:"https://control.example",
  controlPlaneToken:"c".repeat(48),factsPublicB64:facts.publicKey.export({format:"der",type:"spki"}).toString("base64"),
  rightsPublicB64:rights.publicKey.export({format:"der",type:"spki"}).toString("base64"),
  sleepImpl:async()=>{},fetchImpl:async(url,options)=>{
   if(new URL(url).pathname.endsWith("/attest")){
    const draft={...JSON.parse(options.body).draft,risk_context:context};
    const claims=riskStreamOriginalClaims(draft);
    return {ok:true,status:200,json:async()=>({risk_context:context,proof:{
     facts_signature_b64:sign(null,Buffer.from("geomacro.machine-original-facts.v1\n"+claims),facts.privateKey).toString("base64"),
     rights_signature_b64:sign(null,Buffer.from("geomacro.machine-commercial-rights.v1\n"+claims),rights.privateKey).toString("base64")}})};
   }
   posted.push(JSON.parse(options.body));
   return {ok:true,status:202,json:async()=>({ok:true,accepted:1,commercial_delivery:false})};
  }});
 assert.equal(output.status,"POSTED");
 assert.equal(posted[0].items[0].risk_context.raw_source_redacted,true);
 assert.doesNotMatch(JSON.stringify(posted),/secret channel|t\.me\/private|https:\/\/t\.me/iu);
});

test("collector workflows run the sidecar builder immediately before the shared dual-attester emitter",()=>{
 for(const path of [".github/workflows/hot50-direct-original-news-20m.yml",
  ".github/workflows/private-global-osint-15m.yml"]){
  const workflow=readFileSync(path,"utf8");
  assert.match(workflow,/collect-risk-stream-feed-extensions\.mjs --collector/u);
  assert.match(workflow,/emit-risk-stream-collector-sidecar\.mjs/u);
  assert.match(workflow,/RISK_STREAM_MACHINE_FACTS_SPKI_B64/u);
  assert.match(workflow,/RISK_STREAM_MACHINE_RIGHTS_SPKI_B64/u);
 }
});
