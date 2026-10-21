import {Database} from 'bun:sqlite';
import {readFileSync,appendFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {generateKeyPairSync,createHash,sign,randomBytes} from 'node:crypto';
import {canonicalJson} from '../../src/lib/canonical-json';
// @ts-expect-error Existing JavaScript Worker handler has no declaration file.
import {predgeRiskGateD1,verifyHotGRO} from '../../workers/control-plane/src/predge-risk-gate-d1.mjs';

const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
export async function startEphemeralD1Staging({port=3101}={}){
 if(process.env.RISK_GATE_LOAD_TEST_ACK!=='STAGING_ONLY'||process.env.NODE_ENV==='production')
  throw Error('DISPOSABLE_STAGING_ONLY');
 const db=new Database(':memory:');
 db.exec('CREATE TABLE schema_meta(name TEXT PRIMARY KEY,version INTEGER,updated_at TEXT)');
 for(const name of ['0012_country_gro_verified_hot.sql','0020_predge_risk_gate_d1.sql'])
  db.exec(readFileSync(new URL('../../workers/control-plane/migrations/'+name,import.meta.url),'utf8'));
 const pair=generateKeyPairSync('ed25519');
 const authority={key_id:'ephemeral-d1-staging',public_key_spki_b64:pair.publicKey.export({format:'der',type:'spki'}).toString('base64')};
 const token=randomBytes(32).toString('hex'),now=Date.now();
 const generated=new Date(now-30000).toISOString(),expires=new Date(now+2*3600000).toISOString();
 const env={PREDGE_RISK_GATE_TOKEN:token,RISK_GATE_VERIFY_KEYS_JSON:JSON.stringify({[authority.key_id]:{
  status:'active',public_key_spki_b64:authority.public_key_spki_b64}}),DB:{prepare:(sql:string)=>({bind:(...args:any[])=>({
   first:async()=>db.query(sql).get(...args),run:async()=>db.query(sql).run(...args),
  })})}};
 for(const subject of [{type:'country',id:'USA'},{type:'corridor',id:'USA>CHN'}]){
  const obj:any={schema_version:'gro-1.1',object_id:'synthetic-'+subject.id,subject,
   generated_at:generated,observed_at:generated,expires_at:expires,issuer:'Geomacro',
   risk:{score:30,label:'LOW',previous_score:29,delta:1,direction:'escalating'},confidence:0.95,
   attribution:[{driver:'other',score_contribution:30,delta_contribution:1,event_count:1,weight:1}],
   evidence:[{synthetic:true}],evidence_summary:{independent_source_count:1},
   verification:{status:'VERIFIED'},commercial_eligibility:{status:'VERIFIED'},decision_readiness:{status:'READY'},
   methodology_version:subject.type==='country'?'country-risk-v0.1.0-pilot':'corridor-endpoint-max-v0.1.0-pilot',
   integrity:{input_hash:hash('synthetic input'),data_hash:hash('synthetic data'),calculation_hash:hash('synthetic calculation'),
    payload_hash:null,signature:null,signing_key_id:authority.key_id,signature_scheme:'Ed25519',canonicalization:'geomacro-canonical-json-v1'}};
  const bytes=canonicalJson(obj);obj.integrity.payload_hash=hash(bytes);obj.integrity.signature=sign(null,Buffer.from(bytes),pair.privateKey).toString('base64');
  const raw=canonicalJson(obj),row={object_id:obj.object_id,schema_version:obj.schema_version,generated_at:generated,expires_at:expires,
   signing_key_id:authority.key_id,payload_hash:obj.integrity.payload_hash,record_sha256:hash(raw),archive_write_acknowledged:1,object_json:raw};
  // Real crypto passes under the isolated code-level test authority, but the
  // exact same fixture MUST be rejected by the production pinned authority.
  if(!await verifyHotGRO(row,env,subject,now,authority)||await verifyHotGRO(row,env,subject,now))throw Error('STAGING_TRUST_ISOLATION_FAILED');
  const fields:any={...row,[subject.type==='country'?'country_iso3':'corridor_id']:subject.id,verified_at:generated,updated_at:generated};
  if(subject.type==='country')Object.assign(fields,{archive_key:'SYNTHETIC_ONLY',archive_sha256:hash('synthetic archive'),archive_readback_verified:0});
  const keys=Object.keys(fields),table=subject.type==='country'?'country_gro_verified_hot':'corridor_gro_verified_hot';
  db.query(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...Object.values(fields) as any[]);
 }
 const server=Bun.serve({hostname:'127.0.0.1',port,fetch:async(request:Request)=>{
  const url=new URL(request.url);
  if(url.pathname==='/health'&&request.method==='GET')return Response.json({ok:true,synthetic:true,backend:'sqlite-d1-sql-adapter'});
  if(url.pathname!=='/v1/partner/predge/risk-gate')return new Response(null,{status:404});
  return predgeRiskGateD1(request,env,Date.now(),authority);
 }});
 return {server,token,origin:'http://127.0.0.1:'+server.port,db};
}
if(import.meta.main){
 const target=process.env.GITHUB_ENV;if(!target)throw Error('GITHUB_ENV_REQUIRED');
 const {origin,token}=await startEphemeralD1Staging();
 appendFileSync(target,'NODE_ENV=development\nGEOMACRO_RISK_GATE_LOCAL_D1_ORIGIN='+origin+
  '\nRISK_GATE_STAGING_BASE_URL=http://127.0.0.1:3000\nRISK_GATE_STAGING_API_KEY='+token+'\n');
 mkdirSync('artifacts',{recursive:true});
 writeFileSync('artifacts/ephemeral-risk-gate-staging-provision.json',JSON.stringify({
  schema:'geomacro.disposable-d1-staging.v1',synthetic:true,backend:'sqlite-d1-sql-adapter',
  actual_worker_handler:true,production_trust_rejects_fixture:true,production_acceptance:false,
  external_requests:0,supabase_used:false,payments:0}));
}
