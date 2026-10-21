import test from "node:test";
import assert from "node:assert/strict";
import {buildCommercialRightsRemediationInventory,triageCommercialRightsCandidates,
  draftExactItemPermissionRequest} from "./commercial-rights-remediation.mjs";
import {COMMERCIAL_SOURCE_RIGHTS_EVIDENCE} from "../commercial-source-rights-evidence.mjs";

const NOW=new Date("2026-10-21T12:00:00.000Z");
const base={
 source_id:"world_bank_indicators",category:"macro",issuer_id:"worldbank",
 original_article_sha256:"a".repeat(64),same_event_claim_sha256:"b".repeat(64),
 original_published_at:"2026-10-21T11:00:00.000Z",third_party_material_excluded:true
};
test("all registry sources are inventoried, without manufacturing commercial permission",()=>{
 const result=buildCommercialRightsRemediationInventory();
 assert.equal(result.registered_sources_examined,Object.keys(COMMERCIAL_SOURCE_RIGHTS_EVIDENCE).length);
 assert.equal(result.rights_automatically_granted,0);
 assert.equal(result.signatures_issued,0);
 assert.equal(result.rows.every(x=>x.no_attribution_commercial_article_permission_verified===false),true);
 assert.equal(result.rows.every(x=>x.automated_rights_signature_issued===false),true);
 assert.equal(result.rows.every(x=>x.source_raw_material_rights_granted===false),true);
 assert.equal(new Set(result.rows.map(x=>x.source_id)).size,result.rows.length);
});
test("USGS government produced data is an exact-item CANDIDATE not a blanket license",()=>{
 const result=triageCommercialRightsCandidates([{
  ...base,source_id:"usgs_mcs",category:"rare_earth",issuer_id:"usgs_official",
 }],{now:NOW});
 assert.equal(result.rows[0].state,"PUBLIC_DOMAIN_FIRST_PARTY_ITEM_REVIEW_READY");
 assert.equal(result.rows[0].per_article_commercial_permission_verified,false);
 assert.equal(result.rows[0].rights_signature_issued,false);
 assert.equal(result.rows[0].signed_commercial_gro,false);
});
test("CC BY/source-credit-required cannot silently enter a no-attribution product",()=>{
 const result=triageCommercialRightsCandidates([base],{now:NOW});
 assert.equal(result.rows[0].state,"ATTRIBUTION_OBLIGATION_CONFLICTS_WITH_SOURCE_PRIVATE_OUTPUT");
 assert.equal(result.rows[0].paid_api_authorized,false);
});
test("same content hash or same issuer+claim is deduped",()=>{
 const rows=triageCommercialRightsCandidates([
  base,{...base,original_article_sha256:"c".repeat(64)},
  {...base,issuer_id:"different-issuer",original_article_sha256:"a".repeat(64)},
  {...base,issuer_id:"independent-origin",original_article_sha256:"d".repeat(64)}
 ],{now:NOW});
 assert.equal(rows.duplicates_excluded,2);
 assert.equal(rows.rows[1].next_action,"DEDUPLICATE_AND_FIND_INDEPENDENT_FIRST_PARTY_ORIGINAL");
 assert.equal(rows.rows[2].next_action,"DEDUPLICATE_AND_FIND_INDEPENDENT_FIRST_PARTY_ORIGINAL");
 assert.equal(rows.rows[3].eligible_as_independent_original,true);
});
test("unknown rights, wrong category, stale dates or third party scope deny promotion",()=>{
 let r=triageCommercialRightsCandidates([{...base,source_id:"unknown"}],{now:NOW});
 assert.equal(r.rows[0].state,"SOURCE_CONTRACT_UNREGISTERED_OR_OUT_OF_SCOPE");
 r=triageCommercialRightsCandidates([{...base,category:"rare_earth"}],{now:NOW});
 assert.equal(r.rows[0].state,"SOURCE_CONTRACT_UNREGISTERED_OR_OUT_OF_SCOPE");
 r=triageCommercialRightsCandidates([{...base,original_published_at:"2026-10-19T00:00:00.000Z"}],{now:NOW});
 assert.equal(r.rows[0].state,"NOT_CURRENT_SOURCE_EVIDENCE");
 r=triageCommercialRightsCandidates([{...base,third_party_material_excluded:false}],{now:NOW});
 assert.equal(r.rows[0].state,"THIRD_PARTY_MATERIAL_SCOPE_UNVERIFIED");
});
test("permission letter is explicitly unsent and cannot grant anything",()=>{
 const request=draftExactItemPermissionRequest(base);
 assert.match(request.text,/exact work covered/);
 assert.match(request.text,/silence/);
 assert.equal(request.send_automatically,false);
 assert.equal(request.grant_obtained,false);
 assert.equal(request.rights_signature_issued,false);
 assert.throws(()=>draftExactItemPermissionRequest({...base,source_id:"unknown"}),/INVALID/);
});
test("invalid or unbounded input fails closed",()=>{
 assert.throws(()=>triageCommercialRightsCandidates([{...base,original_article_sha256:"fake"}]),/INVALID/);
 assert.throws(()=>triageCommercialRightsCandidates([{...base,third_party_material_excluded:"yes"}]),/INVALID/);
 assert.throws(()=>triageCommercialRightsCandidates(Array.from({length:1001},()=>base)),/INVALID/);
 assert.throws(()=>buildCommercialRightsRemediationInventory({}),/INVALID/);
});
