import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GRI_NEWS_WORKFLOWS} from '../ops/verify-gri-news-wakeup.mjs';
const w=readFileSync('.github/workflows/standing-delegated-derived-attestation.yml','utf8');
const producer=w.split('  approve-retained-derived-inputs:')[1].split('  cloud-derived-only:')[0];
const delegated=w.split('  cloud-derived-only:')[1];
test('all actual news completions and existing hourly recovery wake derived approval',()=>{
 for(const name of GRI_NEWS_WORKFLOWS)assert.ok(w.includes('"'+name+'"'),name);
 assert.match(w,/cron: '23 \* \* \* \*'/u);
 assert.equal(w.includes('head_sha == github.sha'),false);
 assert.match(producer,/node scripts\/ops\/verify-gri-news-wakeup.mjs/u);
 assert.match(producer,/fetch-depth: 0/u);
 assert.ok(producer.indexOf('verify-gri-news-wakeup.mjs')<producer.indexOf('publish-automated-intelligence-inputs.ts'));
});
test('derived issuer and delegated machine never share private signer material',()=>{
 assert.match(producer,/RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64/u);
 for(const denied of ['GEOMACRO_DELEGATED_MACHINE_PRIVATE_PKCS8_B64',
  'GEOMACRO_MACHINE_FACTS_PRIVATE','GEOMACRO_MACHINE_RIGHTS_PRIVATE',
  'GEOMACRO_OWNER_HUMAN_SIGNED_ENVELOPE_B64','COINBASE_API_KEY','B2_APPLICATION_KEY'])
  assert.equal(producer.includes(denied),false,denied);
 assert.equal(delegated.includes('RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64'),false);
 assert.match(delegated,/GEOMACRO_DELEGATED_MACHINE_PRIVATE_PKCS8_B64/u);
 assert.equal(delegated.includes('GEOMACRO_COMMERCE_LEDGER_TOKEN'),false);
});
test('failed signing cannot become a successful delegated audit; fresh readback required',()=>{
 assert.match(delegated,/needs: \[contract, approve-retained-derived-inputs\]/u);
 assert.equal(delegated.slice(0,delegated.indexOf('runs-on:')).includes('always()'),false);
 assert.match(producer,/bun scripts\/ops\/verify-all-news-signed-publications.mjs/u);
 assert.match(delegated,/verify-all-news-signed-publications.mjs > /u);
 assert.ok(delegated.indexOf('verify-all-news-signed-publications.mjs >')<delegated.indexOf('--sign-verified-derived'));
 assert.match(delegated,/GEOMACRO_STANDING_DELEGATION_REVOKED/u);
});
test('automatic ingestion does not silently expand the signed human delegation',()=>{
 const policy=readFileSync('scripts/lib/standing-derived-delegation.mjs','utf8');
 for(const denied of ['commercial_rights_attestation','external_independent_review',
  'gri_v12_numerical_score','paid_settlement'])assert.ok(policy.includes('"'+denied+'"'));
 assert.match(policy,/p.numerical_gri_authorized!==false/u);
 assert.match(policy,/p.real_payments_authorized!==false/u);
});
