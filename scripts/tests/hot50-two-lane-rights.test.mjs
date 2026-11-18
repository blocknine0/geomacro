import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedLegalAnchor,hasIndependentApprovedRolePair}
 from '../../workers/control-plane/src/risk-stream-approved-role-pairs.mjs';
import {redactedRightsRadar} from '../lib/rights-redacted-speed-radar.mjs';
const now=Date.parse('2026-11-18T12:00:00Z');
const make=(role,domain,parent,extra={})=>({source_role:role,
 publisher_root_domain:domain,parent_media_entity:parent,
 original_verified:1,enabled:1,commercial_rights_approved:1,
 rights_expire_at:'2027-11-01',...extra});
for(const [category,a,b] of [
 ['GEOPOLITICS','GOVERNMENT_WIRE','INDEPENDENT_REGIONAL'],
 ['MACRO_FX','OFFICIAL_STATISTICS','MARKET_PRICE'],
 ['CRITICAL_MINERALS','TRADE_CUSTOMS','INDEPENDENT_INDUSTRY']]){
 test('independent live approved '+category+' source-role pair supports Standard only',()=>{
  const one=make(a,'official.gov','first_parent'),two=make(b,'data.example','second_parent');
  assert.equal(approvedLegalAnchor(one,category,now),true);
  assert.equal(hasIndependentApprovedRolePair([one,two],category,now),true);
  assert.equal(hasIndependentApprovedRolePair([one,{...two,parent_media_entity:'first_parent'}],category,now),false);
  assert.equal(hasIndependentApprovedRolePair([one,{...two,publisher_root_domain:'official.gov'}],category,now),false);
  assert.equal(hasIndependentApprovedRolePair([one,{...two,commercial_rights_approved:0}],category,now),false);
  assert.equal(hasIndependentApprovedRolePair([one,{...two,rights_expire_at:'2026-11-17'}],category,now),false);
  assert.equal(hasIndependentApprovedRolePair([one,{...two,original_verified:0}],category,now),false);
 });
}
test('redacted radar uses only hashes, not publisher/article text or paid rights',()=>{
 const radar=redactedRightsRadar({category:'macro',country_iso3:'USA',
  same_event_claim_sha256:'a'.repeat(64),original_published_at:'2026-11-18T10:10:10Z',
  raw_body:'SECRET-COPYRIGHT',source_url:'https://publisher.example/proprietary'});
 assert.equal(radar.category,'MACRO_FX');assert.equal(radar.commercial_rights_approved,0);
 assert.equal(radar.corroborates_commercial_standard,false);
 assert.equal(radar.licensed_source_text_included,false);
 assert.equal(radar.raw_source_redacted,true);
 assert.doesNotMatch(JSON.stringify(radar),/SECRET|publisher\.example/);
});
