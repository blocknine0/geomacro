import {describe,it,expect} from 'vitest';
import {stageAutomaticGroInputs} from '../../scripts/ops/stage-automatic-gro-inputs';
import {validatedSnapshot} from '../lib/on-demand-qualified-country-risk.server';
const now=new Date('2026-11-06T12:00:00Z');
function fixture(){
 const packages=['geopolitics','macro','rare_earth'].map((category,index)=>({category,country_iso3:'USA',
  event:{id:'stage-fixture-'+index,domain:category,event_type:'fixture',title:'Offline staging fixture',primary_country:'USA',countries:['USA'],
   severity:60,confidence:90,direction:'UP',first_seen_at:'2026-11-06T11:30:00Z',last_seen_at:'2026-11-06T11:40:00Z',material_evidence_at:'2026-11-06T11:30:00Z',
   evidence_count:2,independent_source_count:2,source_ids:['a','b'],source_families:['first','second'],evidence_refs:[],structure_version:'fixture-v1',structured_payload:{},
   relevance_weight:1,corroboration_status:'CONFIRMED'},candidates:[{},{}],envelope:{proof:{expires_at:'2026-11-06T13:00:00.000Z'}}}));
 const admitted=packages.map(pkg=>({event_id:pkg.event.id,category:pkg.category,country_iso3:'USA',
  exact_evidence_sha256:validatedSnapshot({category:pkg.category,country_iso3:'USA',events:[pkg.event]} as any,now).sha256}));
 return {input:{eventPackages:packages},qualified:{receipt:{commercial_event_admission:true,qualified:admitted}}};
}
function sink(){
 const stored=new Map<string,Buffer>(),pool=new Map<string,any>(),jobs=new Map<string,any>();
 const archive={get:async(key:string)=>stored.get(key),
  putWithMetadataVerification:async(key:string,bytes:Buffer,options:any)=>{await options.verifyRestored(bytes);stored.set(key,bytes)}};
 const db={query:async(sql:string,args:any[])=>{
  if(sql.startsWith('INSERT INTO gro_auto_signing_category_inputs')){
   pool.set(args[0]+':'+args[1],{country_iso3:args[0],category:args[1],input_sha256:args[2],b2_key:args[3],source_at:args[4],expires_at:args[5]});return [];
  }
  if(sql.includes('FROM gro_auto_signing_category_inputs'))return [...pool.values()].filter(x=>x.country_iso3===args[0]&&x.expires_at>args[1]);
  if(sql.startsWith('INSERT OR IGNORE INTO gro_auto_signing_jobs')){
   jobs.set(args[0],{input_sha256:args[0],b2_key:args[1],country_iso3:args[2],expires_at:args[4]});return [];
  }
  return jobs.has(args[0])?[jobs.get(args[0])]:[];
 }};
 return {stored,pool,jobs,archiveClient:()=>archive,db};
}
describe('qualified source batch to private unsigned-GRO signing outbox',()=>{
 it('stages exact three-category bytes and acknowledges an immutable durable job',async()=>{
  const f=fixture(),storage=sink();
  const result=await stageAutomaticGroInputs({...f,now,...storage});
  expect(result.enqueued).toBe(1);expect(result.failed).toBe(0);
  const payload=JSON.parse([...storage.stored.values()][0].toString());
  expect(payload.parts.length).toBe(3);expect(payload.schema).toBe('geomacro.private-machine-commercial-country-request.v1');
  expect(payload).not.toHaveProperty('signature');
  const state=[...storage.jobs.values()][0];
  expect(state.b2_key.endsWith(state.input_sha256+'.json')).toBe(true);
 });
 it('rejects a changed event before staging',async()=>{
  const changed=fixture();changed.input.eventPackages[1].event.severity=99;
  await expect(stageAutomaticGroInputs({...changed,now,db:{},archiveClient:()=>{throw Error('unexpected network')}})).rejects.toThrow('EXACT_EVIDENCE_MISMATCH');
 });
 it('single categories are signed independently and separately arriving three categories assemble a real country input',async()=>{
  const f=fixture(),storage=sink();
  for(const [index,pkg] of f.input.eventPackages.entries()){
   const result=await stageAutomaticGroInputs({input:{eventPackages:[pkg]},qualified:f.qualified,now,...storage});
   expect(result.failed).toBe(0);expect(result.enqueued).toBe(1);
   expect(result.single_category_requests).toBe(index<2?1:0);
   expect(result.full_country_requests).toBe(index===2?1:0);
  }
  const full=[...storage.stored.values()].map(x=>JSON.parse(x.toString())).find(x=>x.parts?.length===3);
  expect(full.parts.map((x:any)=>x.category).sort()).toEqual(['geopolitics','macro','rare_earth']);
  expect(storage.jobs.size).toBe(3);
 });
});
