import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fastlaneSourceCheckpoints,publishFastlaneSourceCheckpoints} from '../lib/fastlane-source-checkpoints.mjs';
const at='2026-10-27T10:00:00.000Z';
const reports=()=>['geopolitics','macro','rare_earth'].map(category=>({category,releases_examined:0,primary_publisher_status:[{id:category+'_primary',reachable:true}],fallback_publisher_status:[]}));
test('quiet actual polls refresh all existing collector scopes without inventing news or a partner receipt',async()=>{
 const calls=[];
 const receipt=await publishFastlaneSourceCheckpoints({reports:reports(),published:[],checkedAt:at,origin:'https://geomacro-control-plane.daspallab202391.workers.dev',token:'a'.repeat(64),fetchImpl:async(url,init)=>{
  const scope=url.split('/').at(-1),body=JSON.parse(init.body);calls.push({url,body});
  return Response.json({ok:true,scope,pipeline:'website_derived_news_ingest'});
 }});
 assert.equal(calls.length,3);assert.equal(receipt.checkpoint_writes,3);assert.equal(receipt.partner_client_receipt_asserted,false);
 for(const c of calls){assert.equal(c.body.metadata.accepted_derived_rows,0);assert.equal(c.body.metadata.original_candidates_examined,0);assert.equal(c.body.last_success_at,at);assert.equal(c.body.metadata.checked_at,at);}
 assert.doesNotMatch(JSON.stringify(calls.map(c=>c.body)),/headline|article_url|raw_html|authorization/i);
});
test('one unreachable category cannot inherit another category success; fallback counts are deduplicated',()=>{
 const data=reports();data[0].primary_publisher_status[0].reachable=false;
 const rows=fastlaneSourceCheckpoints({reports:data,published:[{category:'macro'}],checkedAt:at,supplementary:{macro:{checks:[{id:'macro_primary',state:'OK'},{id:'alternative',state:'NOT_MODIFIED'},{id:'denied',state:'COOLDOWN'}],candidates:2}}});
 assert.deepEqual(rows.map(r=>r.category),['macro','rare_earth']);
 const meta=rows[0].body.metadata;assert.equal(meta.sources_configured,3);assert.equal(meta.sources_reachable,2);assert.equal(meta.accepted_derived_rows,1);assert.equal(meta.original_candidates_examined,2);
 assert.throws(()=>fastlaneSourceCheckpoints({reports:reports(),published:[{category:'macro'}],checkedAt:at}),/INVALID/);
});
test('HTTP success without the exact D1 scope acknowledgement never becomes verified freshness',async()=>{
 await assert.rejects(publishFastlaneSourceCheckpoints({reports:reports(),checkedAt:at,origin:'https://geomacro-control-plane.daspallab202391.workers.dev',token:'a'.repeat(64),fetchImpl:async()=>Response.json({ok:true,scope:'wrong',pipeline:'website_derived_news_ingest'})}),/NOT_ACKNOWLEDGED/);
 const script=readFileSync('scripts/ops/publish-original-news-five-minute-fastlane.ts','utf8');
 const gate=script.indexOf('if(journalVerified){',script.indexOf('// Advance conditional-GET cursors'));
 assert.ok(gate>script.indexOf('verifiedArchiveSignals=records'));
 assert.ok(script.indexOf('await publishFastlaneSourceCheckpoints(',gate)>gate);
});
