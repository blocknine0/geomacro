import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {SupabaseRpcPool} from '../src/payments/rpc-http.mjs';
import worker from '../src/worker.mjs';
const db=new PGlite();
before(async()=>{
 await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
 for(const name of ['schema.sql','functions.sql','payments.sql','replay-ownership.sql','risk-api.sql','rpc-gateway.sql'])
  await db.exec(await readFile(new URL(`../sql/${name}`,import.meta.url),'utf8'));
});
after(()=>db.close());
const call=async(op,args=[]) => (await db.query('SELECT public.geomacro_commercial_rpc($1,$2::jsonb) AS result',[op,JSON.stringify(args)])).rows[0].result;
test('service-only gateway health and typed array quote work',async()=>{
 assert.equal((await call('health')).ready,true);
 assert.equal((await call('quote',['complex',['standard']])).tier,'standard');
 assert.deepEqual(await call('x402_pending',[10]),[]);
});
test('anonymous and authenticated users cannot call financial gateway',async()=>{
 for(const role of ['anon','authenticated']){
  await db.exec(`SET ROLE ${role}`);
  try{await assert.rejects(call('health'),/permission denied/);}finally{await db.exec('RESET ROLE');}
 }
 await db.exec('SET ROLE service_role');
 try{assert.equal((await call('health')).ready,true);
  await assert.rejects(db.query('SELECT * FROM geomacro.users'),/permission denied/);
 }finally{await db.exec('RESET ROLE');}
});
test('gateway rejects unknown operation and wrong arity',async()=>{
 await assert.rejects(call('top_up'),/RPC_OPERATION_NOT_ALLOWED/);
 await assert.rejects(call('provision_user',[]),/RPC_ARITY_INVALID/);
});
test('HTTP adapter preserves secret-key semantics and rejects pretend transactions',async()=>{
 const pool=new SupabaseRpcPool({url:'https://project.supabase.co',key:'sb_secret_TEST',fetchImpl:async(url,options)=>{
  assert(!options.headers.Authorization);assert.equal(options.headers.apikey,'sb_secret_TEST');
  assert.equal(options.redirect,'manual');
  const {p_operation,p_args}=JSON.parse(options.body);return Response.json(await call(p_operation,p_args));
 }});
 assert.equal((await pool.call('health')).ready,true);
 await assert.rejects(pool.query('BEGIN'),/HTTP_RPC_REQUIRES_SINGLE_ATOMIC_FUNCTION/);
 assert.deepEqual((await pool.query('SELECT geomacro.x402_pending($1) AS result',[10])).rows,[]);
});
test('deployed worker health truthfully exposes activation blockers without secrets',async()=>{
 const env={SITE_ORIGIN:'https://geomacro.live',DEPLOYED_SHA:'abc123'};
 const response=await worker.fetch(new Request('https://service.example/health'),env);
 const body=await response.json();assert.equal(body.ok,true);assert.equal(body.deployed_sha,'abc123');
 assert.equal(body.paypal_configured,false);assert.equal(body.x402_configured,false);
 assert.equal(body.execution_authorized,false);assert(body.blockers.includes('COMMERCIAL_LEDGER_NOT_CONFIGURED'));
 const unavailable=await worker.fetch(new Request('https://service.example/v1/risk-gate',{
  method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),env);
 assert.equal(unavailable.status,503);assert.equal((await unavailable.json()).execution_authorized,false);
});

test('Worker global fetch receiver is bound to globalThis, never a client instance',async()=>{
 const pool=new SupabaseRpcPool({url:'https://project.supabase.co',key:'sb_secret_TEST',fetchImpl:async function(){
  assert.equal(this,globalThis,'Cloudflare global fetch requires its global receiver');return Response.json({ready:true});
 }});
 assert.equal((await pool.call('health')).ready,true);
});

test('OpenAPI discovery describes the actual risk endpoint without claiming execution',async()=>{
 const r=await worker.fetch(new Request('https://service.example/v1/commercial/openapi.json'),{SITE_ORIGIN:'https://geomacro.live'});
 assert.equal(r.status,200);const spec=await r.json();assert.equal(spec.openapi,'3.1.0');
 assert(spec.paths['/v1/risk-gate'].post);assert.equal(spec['x-execution-authorized'],false);
});
