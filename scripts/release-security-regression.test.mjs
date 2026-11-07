import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyCorroborationBinding} from '../src/risk/hot50Attestation.ts';
import {classifyGraphQLFailure} from './release-common.ts';

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
 assert.doesNotMatch(s,/quantiles\{requestDurationP99\}/);
 assert.match(s,/CANARY_ROLLBACK_BASELINE_100_VERIFIED/);
});

test('Cloudflare Analytics query declares provider-specific lowercase string scalar',()=>{
 for(const path of [
  'scripts/verify-d1-quota-proof.ts','scripts/canary-promoter.ts',
  'src/middleware/quotaWorker.ts','scripts/ops/audit-d1-account-daily-quota-readonly.mjs']){
  const source=readFileSync(path,'utf8');
  assert.match(source,/\$accountTag:string!/u,path);
  assert.doesNotMatch(source,/\$[A-Za-z_][A-Za-z_0-9]*:String!/u,path);
 }
 const source=readFileSync('scripts/canary-promoter.ts','utf8');
 assert.match(source,/\$script:string!/u);
 assert.match(source,/\$version:string!/u);
});

test('real provider error categories remain fixed codes; no provider text leaks',()=>{
 assert.equal(classifyGraphQLFailure({errors:[{message:'Unknown type "String"'}]}),
  'RELEASE_GRAPHQL_SCHEMA_REJECTED');
 assert.equal(classifyGraphQLFailure({errors:[{message:'Cannot query field "fake"'}]}),
  'RELEASE_GRAPHQL_SCHEMA_REJECTED');
 assert.equal(classifyGraphQLFailure({errors:[{message:'Insufficient scope for account secret token abc'}]}),
  'RELEASE_GRAPHQL_ACCESS_DENIED');
 assert.equal(classifyGraphQLFailure({errors:[{message:'Rate limit exceeded'}]}),
  'RELEASE_GRAPHQL_RATE_OR_COST_LIMIT');
 assert.equal(classifyGraphQLFailure({errors:[{message:'Secret token xyz abc'}]}),
  'RELEASE_GRAPHQL_PROVIDER_ERRORS');
 assert.equal(classifyGraphQLFailure(null),'RELEASE_GRAPHQL_RESPONSE_INVALID');
});

test('D1 non-indexed query remains HOLD with named table + actual physical planner diagnostic',()=>{
 const s=readFileSync('scripts/apply-d1-migrations.ts','utf8');
 assert.match(s,/d1-hot-query-plan-diagnostic\.json/u);
 assert.match(s,/status:'HOLD'/u);
 assert.match(s,/actual_provider_planner:planner/u);
 assert.match(s,/RELEASE_HOT_QUERY_NOT_INDEXED_/u);
 assert.doesNotMatch(s,/RELEASE_HOT_QUERY_NOT_INDEXED'\)/u);
});

test('Hot50 missing manifest gives an explicit HOLD rather than opaque exception',()=>{
 const s=readFileSync('src/risk/hot50Attestation.ts','utf8');
 assert.match(s,/need\(existsSync\(path\),'HOT50_EVENT_MANIFEST_MISSING'\)/u);
 assert.match(s,/HOT50_150_CELL_INPUT_MISSING/u);
});

test('website schema check respects actual SQLite original ordered index with physical key proof',()=>{
 const migration=readFileSync('workers/control-plane/migrations/0017_website_derived_news_only.sql','utf8');
 const code=readFileSync('scripts/apply-d1-migrations.ts','utf8');
 // The real Cloudflare EXPLAIN in run 42415525486 selected the original
 // idx_website_derived_intelligence_latest from migration 0017, which has
 // exactly the published_at DESC / id DESC order for this bounded query.
 assert.match(migration,/CREATE INDEX IF NOT EXISTS idx_website_derived_intelligence_latest[\\s\\S]*?\\(published_at DESC,id DESC\\)/u);
 assert.match(code,/table:'website_derived_intelligence',index:'idx_website_derived_intelligence_latest'/u);
 assert.match(code,/PRAGMA index_xinfo/u);
 assert.match(code,/keys\\.length===2/u);
 assert.match(code,/keys\\[0\\]\\.name==='published_at'/u);
 assert.match(code,/keys\\[1\\]\\.name==='id'/u);
 assert.match(code,/keys\\[0\\]\\.desc===1&&keys\\[1\\]\\.desc===1/u);
 assert.match(code,/RELEASE_WEBSITE_NATIVE_ORDER_INDEX_SHAPE_INVALID/u);
 // Newly-added v2 index stays protected by the existing 0204–0211
 // schema-object and history checks, even when SQLite chooses original.
 assert.match(code,/REPAIR_SCHEMA_OBJECTS/u);
 assert.match(code,/RELEASE_SCHEMA_OBJECTS_INCOMPLETE/u);
});
