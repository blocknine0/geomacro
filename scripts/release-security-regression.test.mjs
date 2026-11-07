import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyCorroborationBinding} from '../src/risk/hot50Attestation.ts';

// Pure structure regression fixtures. These are never fetched, signed, charged
// or accepted as evidence; actual attestations require dual machine signatures.
const hash='a'.repeat(64);
const make=()=>{
 const publishers=[
  ['issuer-one','https://agency-one.example.com/original','b'.repeat(64)],
  ['issuer-two','https://agency-two.example.com/original','c'.repeat(64)],
  ['issuer-three','https://agency-three.example.com/original','d'.repeat(64)],
 ];
 return {
  country_iso3:'USA',category:'geopolitics',factual_record_sha256:hash,
  publisher_sources:publishers.map(([publisher_org_id,url,page_sha256])=>({
   publisher_org_id,url,page_sha256
  })),
  facts_rights_proof:{
   countryIso3:'USA',factualRecordSha256:hash,
   independentSameEventVerified:true,sourceNativeTimeVerified:true,
   independentEvidence:publishers.map(([issuer,url,contentSha256])=>({
    issuer,url,contentSha256,independentlyFetched:true,issuerVerified:true,
    sameEventVerified:true,factVerified:true,
    licenceOrPublicDomainVerified:true,thirdPartyMaterialExcluded:true
   }))
  }
 };
};

test('Hot50 structural precondition requires each exact original issuer, URL and byte SHA',()=>{
 const e=make();assert.equal(verifyCorroborationBinding(e),true);
 assert.equal(verifyCorroborationBinding({...e,country_iso3:'RUS'}),false);
 assert.equal(verifyCorroborationBinding({...e,factual_record_sha256:'f'.repeat(64)}),false);
 for(const prop of ['independentSameEventVerified','sourceNativeTimeVerified']){
  const x=make();x.facts_rights_proof[prop]=false;
  assert.equal(verifyCorroborationBinding(x),false);
 }
 for(const prop of ['issuer','url','contentSha256','independentlyFetched',
  'issuerVerified','sameEventVerified','factVerified',
  'licenceOrPublicDomainVerified','thirdPartyMaterialExcluded']){
  const x=make();x.facts_rights_proof.independentEvidence[0][prop]=null;
  assert.equal(verifyCorroborationBinding(x),false,prop);
 }
 const duplicated=make();
 duplicated.facts_rights_proof.independentEvidence.push(
  {...duplicated.facts_rights_proof.independentEvidence[0]});
 assert.equal(verifyCorroborationBinding(duplicated),false);
});

test('Hot50 structure alone cannot substitute for separate original and rights signature checks',()=>{
 const source=readFileSync('src/risk/hot50Attestation.ts','utf8');
 const structural=source.indexOf("need(verifyCorroborationBinding(e)");
 const signatures=source.indexOf("need(verifyPinnedFactsOnlyGriV12Proof(e.facts_rights_proof)");
 assert.ok(structural>0&&signatures>structural);
 assert.match(source,/HOT50_ORIGINAL_PUBLIC_HTTPS_REQUIRED/);
});

test('B2 physical audit preserves permanent zero-list policy and never advertises full parity',()=>{
 const source=readFileSync('scripts/certify-b2-parity.ts','utf8');
 assert.doesNotMatch(source,/\bListObjects(?:V2)?\b|list-type=2|b2_list_file_names/u);
 assert.match(source,/physical_list_complete:false,bidirectional_parity_pass:false/);
 assert.match(source,/status:'HOLD'/);
 assert.match(source,/existing_no_list_quota_policy_preserved:true/);
});

test('canary version-specific wall-time p99 is converted from microseconds',()=>{
 const s=readFileSync('scripts/canary-promoter.ts','utf8');
 assert.match(s,/scriptVersion:\$version/);
 assert.match(s,/quantiles\{wallTimeP99\}/);
 assert.match(s,/const p99=wallTimeP99Us\/1000/);
 assert.match(s,/version_errors_under_0_1pct/);
 assert.doesNotMatch(s,/requestDurationP99/);
 assert.match(s,/CANARY_ROLLBACK_BASELINE_100_VERIFIED/);
});
