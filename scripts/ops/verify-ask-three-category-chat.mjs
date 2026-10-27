#!/usr/bin/env node
// Read-only acceptance. Synthetic public questions, no tokens or payments.
import {pathToFileURL} from 'node:url';
export async function verifyAskChat(base='https://geomacro.live',fetchImpl=fetch){
 const origin=new URL(base).origin;
 if(!['https://geomacro.live','https://geomacro.lovable.app','http://terminal.local:4173','http://localhost:4173'].includes(origin))throw Error('UNAPPROVED_ASK_ACCEPTANCE_ORIGIN');
 const results=[];
 const cases=[
  ['geopolitics','Explain geopolitical risk','Geopolitical risk','explainer',[]],
  ['macro','What is inflation?','Inflation','explainer',[]],
  ['minerals','What are rare earths?','17 elements','explainer',[]],
  ['follow_up','Why does that matter?','Demand','explainer',[{role:'user',content:'What is inflation?'}]],
  ['scope','Write a recipe for pasta','three categories','guidance',[]],
 ];
 for(const [key,question,expected,kind,history] of cases){
  const r=await fetchImpl(origin+'/api/ask/v2/turn',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Accept:'text/event-stream'},body:JSON.stringify({question,history}),signal:AbortSignal.timeout(20000)});
  if(r.status!==200||!r.headers.get('content-type')?.startsWith('text/event-stream'))throw Error('ASK_STREAM_HTTP_'+key+'_'+r.status);
  const text=await r.text();
  const packet=text.split(/\r?\n\r?\n/).find(frame=>frame.startsWith('event: answer\n'));
  if(!packet)throw Error('ASK_FINAL_ANSWER_MISSING_'+key);
  const payload=JSON.parse(packet.split('\ndata: ')[1]);
  if(payload.ok!==true||payload.data?.answer_kind!==kind||!payload.data.summary.includes(expected))throw Error('ASK_CONTENT_MISMATCH_'+key);
  if(payload.data.gri!==null||payload.data.evidence.length!==0||payload.data.source_identity_exposed!==false||payload.data.durable_live_storage_write!==false)throw Error('ASK_BOUNDARY_FAILED_'+key);
  results.push({case:key,status:'pass'});
 }
 const legacy=await fetchImpl(origin+'/api/public-ask',{headers:{Origin:origin,'X-Geomacro-Question':'What is inflation?',Accept:'application/json'},signal:AbortSignal.timeout(20000)});
 const json=await legacy.json();
 if(legacy.status!==200||json.ok!==true||json.data?.answer_kind!=='explainer')throw Error('ASK_LEGACY_FAILED');
 results.push({case:'legacy',status:'pass'});
 const forbidden=await fetchImpl(origin+'/api/ask/v2/turn',{method:'POST',headers:{Origin:'https://unrelated.example','Content-Type':'application/json'},body:JSON.stringify({question:'What is inflation?',history:[]}),signal:AbortSignal.timeout(20000)});
 if(forbidden.status!==403)throw Error('ASK_CROSS_ORIGIN_NOT_REJECTED');
 results.push({case:'cross_origin',status:'pass'});
 return {origin,results,payment_attempted:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 verifyAskChat(process.env.GEOMACRO_BASE_URL).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});
}
