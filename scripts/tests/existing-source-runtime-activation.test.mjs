import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {existingPrivateP0Sources,observeExistingPrivateP0Sources,P0_MAX_BYTES} from '../ops/observe-p0-private-source-runtime.mjs';
const now=new Date('2026-10-15T21:30:00.000Z');
function jobAllowed(file,job,event,repo='blocknine0/geomacro',ref='refs/heads/main'){
 const text=readFileSync('.github/workflows/'+file,'utf8');
 const block=text.split('\n  '+job+':\n')[1]?.split(/\n  [a-z][a-z-]+:\n/u)[0];
 const expression=block?.match(/^    if: (.+)$/mu)?.[1].replace(/^\$\{\{\s*|\s*\}\}$/gu,'');
 assert.ok(expression,'job activation expression missing');
 // Interpret this small boolean grammar; never execute workflow text as code.
 const context={'github.event_name':event,'github.repository':repo,'github.ref':ref};
 const tokens=expression.match(/github\.(?:event_name|repository|ref)|'[^']*'|==|!=|&&|\|\||[()]/gu)??[];
 assert.equal(tokens.join(''),expression.replace(/\s+/gu,''));
 let cursor=0;
 function atom(){
   if(tokens[cursor]==='('){cursor++;const v=or();assert.equal(tokens[cursor++],')');return v;}
   const key=tokens[cursor++],op=tokens[cursor++],literal=tokens[cursor++];
   assert.ok(Object.hasOwn(context,key));assert.ok(op==='=='||op==='!=');
   assert.match(literal??'',/^'[^']*'$/u);
   const equal=context[key]===literal.slice(1,-1);return op==='=='?equal:!equal;
 }
 function and(){let v=atom();while(tokens[cursor]==='&&'){cursor++;const right=atom();v=v&&right;}return v;}
 function or(){let v=and();while(tokens[cursor]==='||'){cursor++;const right=and();v=v||right;}return v;}
 const result=or();assert.equal(cursor,tokens.length);return result;
}
test('credentialed cron actually runs on protected main and cannot inject credentials into forks or PRs',()=>{
 for(const event of ['push','workflow_dispatch','schedule']){
   assert.equal(jobAllowed('credentialed-source-runtime.yml','runtime',event),true);
   assert.equal(jobAllowed('credentialed-source-runtime.yml','runtime',event,'untrusted/fork'),false);
   assert.equal(jobAllowed('credentialed-source-runtime.yml','runtime',event,undefined,'refs/heads/other'),false);
 }
 assert.equal(jobAllowed('credentialed-source-runtime.yml','runtime','pull_request'),false);
});
test('manual activation attempts every existing operator group, scheduled rotation remains single-group',()=>{
 for(const event of ['push','workflow_dispatch'])assert.equal(jobAllowed('expanded-official-source-observation.yml','operator-free-feed-initial-acceptance',event),true);
 for(const event of ['schedule','pull_request'])assert.equal(jobAllowed('expanded-official-source-observation.yml','operator-free-feed-initial-acceptance',event),false);
 assert.equal(jobAllowed('expanded-official-source-observation.yml','operator-free-feed-rotation-scheduled','schedule'),true);
 assert.equal(jobAllowed('expanded-official-source-observation.yml','operator-free-feed-rotation-scheduled','workflow_dispatch'),false);
});
test('all ten existing endpoints are covered across three categories without changing commercial activation',()=>{
 const sources=existingPrivateP0Sources();
 assert.equal(sources.length,10);assert.equal(new Set(sources.map(s=>s.id)).size,10);
 assert.equal(new Set(sources.map(s=>s.category)).size,3);
 const registry=JSON.parse(readFileSync('config/global-p0-source-expansion.json','utf8'));
 assert.ok(Object.values(registry.p0_global_source_expansion.sources).every(s=>s.enabled===false));
});
test('one upstream denial does not prevent all other source attempts and bodies never leave receipts',async()=>{
 const calls=[];
 const r=await observeExistingPrivateP0Sources({now,fetchImpl:async(url,options)=>{
   calls.push(url);assert.equal(options.redirect,'error');assert.equal(options.method,'GET');
   return new Response('PRIVATE-CONTENT-DO-NOT-PRINT',{status:403});
 }});
 assert.equal(calls.length,10);assert.equal(r.http_requests,10);assert.equal(r.unavailable,10);
 assert.ok(r.results.every(x=>x.reason==='HTTP_403'));
 assert.equal(r.supabase_requests+r.b2_requests+r.d1_writes+r.payments,0);
 assert.equal(r.commercial_eligible,false);assert.equal(r.raw_publisher_content_persisted,false);
 assert.ok(!JSON.stringify(r).includes('PRIVATE-CONTENT'));
 assert.ok(!JSON.stringify(r).includes('https://'));
});
test('reuses actual existing UK parser; malformed provider pages remain unavailable',async()=>{
 const r=await observeExistingPrivateP0Sources({now,fetchImpl:async url=>{
   if(new URL(url).hostname==='sanctionslist.fcdo.gov.uk')return new Response('<Designations><Designation><UniqueID>UK001</UniqueID><PrimaryName>Example</PrimaryName><RegimeName>Example</RegimeName></Designation></Designations>',{headers:{'content-type':'application/xml'}});
   return new Response('<html>PRIVATE not actual provider records</html>',{headers:{'content-type':'text/html'}});
 }});
 const uk=r.results.find(s=>s.source_id==='uk_sanctions_list');
 assert.equal(uk.status,'PRIVATE_CANDIDATES_PARSED');assert.equal(uk.parsed_candidate_count,1);
 assert.equal(uk.current_original_publication_verified,false);
 assert.equal(r.results.find(s=>s.source_id==='opcw_news').status,'UNAVAILABLE');
 assert.equal(r.results.find(s=>s.source_id==='unctadstat_global').status,'HTML_CONTEXT_ONLY');
 assert.ok(!JSON.stringify(r).includes('Example'));
});
test('enforces byte bound from headers and streams and isolates failures without leaking error details',async()=>{
 let n=0;
 const r=await observeExistingPrivateP0Sources({now,fetchImpl:async()=>{
   if(n++===0)return new Response('x',{headers:{'content-length':String(P0_MAX_BYTES+1)}});
   if(n===2)return new Response(new Uint8Array(P0_MAX_BYTES+1));
   throw Error('secret-token upstream response body');
 }});
 assert.equal(r.results[0].reason,'BODY_SIZE_LIMIT');assert.equal(r.results[1].reason,'BODY_SIZE_LIMIT');
 assert.equal(r.unavailable,10);assert.ok(!JSON.stringify(r).includes('secret-token'));
});
test('dataset ZIP and HTML transport are never promoted to parsed observations or current events',async()=>{
 const r=await observeExistingPrivateP0Sources({now,fetchImpl:async url=>{
   if(new URL(url).hostname==='thedocs.worldbank.org'){const b=Buffer.alloc(120);b[0]=0x50;b[1]=0x4b;return new Response(b);}
   return new Response('<html>context</html>',{headers:{'content-type':'text/html'}});
 }});
 const wb=r.results.find(s=>s.source_id==='world_bank_commodity_prices');
 assert.equal(wb.status,'DATASET_TRANSPORT_ONLY');assert.equal(wb.parsed_candidate_count,null);
 assert.equal(r.source_publication_clocks_requalified,false);assert.equal(r.signed_intelligence_published,false);
});
