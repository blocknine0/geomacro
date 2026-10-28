import {test,expect} from "bun:test";
import {Database} from "bun:sqlite";
import {readFileSync} from "node:fs";
import {createHash,generateKeyPairSync,sign as signBytes} from "node:crypto";
import {signAutomatedIntelligenceInput} from "../../src/lib/risk-object-signing.server.ts";
import {automatedInputId} from "../../src/lib/automated-intelligence-input.ts";
import {internalNewsScoreSignable,makeInternalNewsScorePayload,
 internalNewsTriage,verifyInternalNewsScore} from "../../src/lib/internal-news-scoring.ts";
import {putAutomatedInputs} from "../../workers/control-plane/src/automated-intelligence-inputs.ts";
import {getInternalNewsScores,putInternalNewsScores}
 from "../../workers/control-plane/src/internal-signed-news-scores.ts";
import {publishInternalSignedNewsScores} from "../ops/publish-internal-signed-news-scores.ts";
import worker from "../../workers/control-plane/src/index.mjs";

const NOW=Date.parse("2026-10-28T12:00:00.000Z");
const original=generateKeyPairSync("ed25519"),pub=original.publicKey.export({format:"der",type:"spki"}).toString("base64");
const material={key_id:"private-test-issuer",public_key_spki_b64:pub,
 private_key_pkcs8_b64:original.privateKey.export({format:"der",type:"pkcs8"}).toString("base64")};
const registry={[material.key_id]:{public_key_spki_b64:pub,status:"active" as const}};
const envAuth={GEOMACRO_COMMERCE_LEDGER_TOKEN:"a".repeat(40),GITHUB_RUN_ID:"1234",
 GITHUB_SHA:"a".repeat(40),RISK_OBJECT_SIGNING_KEY_ID:material.key_id,
 RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64:material.private_key_pkcs8_b64,
 RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64:pub};
function signal(category:"macro"|"rare_earth"|"geopolitics",i:number,status="official_release_observed_unscored"){
 return {id:category+"-"+i.toString(16).padStart(8,"0"),category,
  title:"Geomacro finds official policy developments affecting trade conditions",
  what_changed:"An official publisher issued a dated original describing government trade changes.",
  why_it_matters:"Changes to regulation may affect trade; further verification determines impact.",
  topic:status==="official_feed_candidate_unscored"?category==="rare_earth"?"minerals publisher candidate":category+" publisher candidate":"trade and economic relations",
  geography:null,development_type:status==="official_feed_candidate_unscored"?"unclassified publisher update":
   category==="macro"?"monetary policy":category==="rare_earth"?"production":"trade restriction",
  published_at:new Date(NOW-3600_000-i*1000).toISOString(),date_precision:"exact",
  observed_release_count:1,sources_credited:[],
  status,same_event_corrob_verified:false,severity:null
 } as any;
}
function store(){
 const db=new Database(":memory:");
 db.exec(readFileSync(new URL("../../workers/control-plane/migrations/0001_core.sql",import.meta.url),"utf8"));
 const env={CONTROL_PLANE_TOKEN:"a".repeat(40),AUTOMATED_FINDS_VERIFY_KEYS_JSON:JSON.stringify(registry),
  DB:{prepare:(sql:string)=>({bind:(...args:any[])=>({sql,args,
    all:async()=>({success:true,results:db.query(sql).all(...args)})})}),
   batch:async(rows:any[])=>db.transaction(()=>rows.map(row=>
    ({success:true,meta:db.query(row.sql).run(...row.args)})))()}};
 return {db,env};
}
async function seed(env:any,signals:any[]){
 const ids:string[]=[];
 const envelopes:any[]=[];
 for(const s of signals){
  const id=await automatedInputId(s);ids.push(id);
  envelopes.push(await signAutomatedIntelligenceInput({
   schema:"geomacro.automated-intelligence-input.v1",
   approval_mode:"AUTOMATED_INGESTION",approved_for:"derived_intelligence_input",
   generated_at:new Date(NOW).toISOString(),
   expires_at:new Date(Date.parse(s.published_at)+72*3_600_000).toISOString(),
   source_run_id:"1234",source_sha:"a".repeat(40),
   signal:s,independent_reviewed:false,commercial_rights_attested:false,scored:false
  },material));
 }
 for(let offset=0;offset<envelopes.length;offset+=40){
  const response=await putAutomatedInputs(env,{schema:"geomacro.automated-intelligence-input-batch.v1",
   retained_ids:ids,items:envelopes.slice(offset,offset+40)},NOW);
  expect(response.status).toBe(200);
 }
 return ids;
}
async function signedScore(s:any){
 const id=await automatedInputId(s),payload=makeInternalNewsScorePayload(s,{
  inputId:id,generatedAt:new Date(NOW).toISOString(),runId:"1234",sha:"a".repeat(40)});
 const text=internalNewsScoreSignable(payload);
 return {payload,integrity:{signing_key_id:material.key_id,signature_scheme:"ed25519" as const,
  canonicalization:"geomacro-canonical-json-v1" as const,
  payload_sha256:createHash("sha256").update(text).digest("hex"),
  signature:signBytes(null,Buffer.from(text),original.privateKey).toString("base64")}};
}
test("scores all three categories, including candidate inputs, without pretending to certify a numerical GRI",async()=>{
 const cats=["geopolitics","macro","rare_earth"] as const;
 for(let i=0;i<3;i++){
  const s=signal(cats[i],i+1),id=await automatedInputId(s),score=await signedScore(s);
  expect(score.payload.scored).toBe(true);
  expect(score.payload.intelligence_score).toBeGreaterThan(0);
  expect(score.payload.input_id).toBe(id);
  expect(score.payload.risk_score).toBe(null);
  expect(score.payload.independent_reviewed).toBe(false);
  expect(score.payload.customer_eligible).toBe(false);
  await verifyInternalNewsScore(score,registry,NOW,s);
 }
 const candidate=signal("macro",8,"official_feed_candidate_unscored");
 expect(internalNewsTriage(candidate).intelligence_score).toBeLessThan(
  internalNewsTriage(signal("macro",8)).intelligence_score);
 const score=await signedScore(candidate);
 await verifyInternalNewsScore(score,registry,NOW,candidate);
});
test("cryptographic score tampering, untrusted source binding, revoked key and expiry fail closed",async()=>{
 const s=signal("rare_earth",1),e=await signedScore(s);
 await verifyInternalNewsScore(e,registry,NOW,s);
 await expect(verifyInternalNewsScore({...e,payload:{...e.payload,intelligence_score:100}},registry,NOW,s)).rejects.toThrow();
 await expect(verifyInternalNewsScore(e,registry,NOW,signal("macro",1))).rejects.toThrow();
 await expect(verifyInternalNewsScore(e,{[material.key_id]:{public_key_spki_b64:pub,status:"revoked"}},NOW,s)).rejects.toThrow();
 await expect(verifyInternalNewsScore(e,registry,NOW+72*3_600_000,s)).rejects.toThrow();
});
test("real D1 SQLite persists all source-bound scores, atomic rejects, dedup and private readback",async()=>{
 const {db,env}=store();
 try{
  const signals=[signal("macro",1),signal("rare_earth",2),signal("geopolitics",3)];
  const ids=await seed(env,signals),scores=await Promise.all(signals.map(signedScore));
  const body={schema:"geomacro.internal-signed-news-score-batch.v1",retained_ids:ids,items:scores};
  const first=await putInternalNewsScores(env,body,NOW);
  expect(first.status).toBe(200);
  expect((await first.json()).newly_inserted).toBe(3);
  expect((await (await putInternalNewsScores(env,body,NOW)).json()).newly_inserted).toBe(0);
  expect((await (await getInternalNewsScores(env,new URLSearchParams("view=ids"),NOW)).json()).ids).toEqual([...ids].sort());
  const full=await (await getInternalNewsScores(env,new URLSearchParams(),NOW)).json();
  expect(full.items).toHaveLength(3);
  const modified={...scores[0],payload:{...scores[0].payload,intelligence_score:99}};
  expect((await putInternalNewsScores(env,{...body,items:[modified]},NOW)).status).toBe(400);
  expect((await putInternalNewsScores(env,{...body,retained_ids:[ids[0]],items:[]},NOW)).status).toBe(400);
  expect((await (await getInternalNewsScores(env,new URLSearchParams("view=ids"),NOW)).json()).ids).toHaveLength(3);
  expect((db.query("SELECT count(*) as count FROM control_state WHERE key GLOB 'internal_signed_news_score_v1:*'").get() as any).count).toBe(3);
  for(const method of ["GET","PUT"]){
   const denied=await worker.fetch(new Request("https://control.example/v1/internal/signed-news-scores",{method}),env);
   expect(denied.status).toBeGreaterThanOrEqual(400);
  }
 }finally{db.close();}
});
test("all-new and no-op automatic publisher retains scores without duplicate writes",async()=>{
 const {db,env}=store();
 try{
  const signals=Array.from({length:81},(_,i)=>signal(
   ["geopolitics","macro","rare_earth"][i%3] as any,i+1));
  await seed(env,signals);
  const fetchImpl=async(url:any,init:any)=>init.method==="PUT"
   ?putInternalNewsScores(env,JSON.parse(init.body),NOW)
   :getInternalNewsScores(env,new URL(String(url)).searchParams,NOW);
  const args={signals,now:new Date(NOW),env:envAuth,fetchImpl:fetchImpl as typeof fetch,keys:registry};
  const first=await publishInternalSignedNewsScores(args);
  expect(first.new_scores_signed).toBe(81);
  expect(first.all_retained_inputs_signed_scored).toBe(true);
  const second=await publishInternalSignedNewsScores(args);
  expect(second.new_scores_signed).toBe(0);
  expect(second.existing_scores_reused).toBe(81);
  expect((db.query("SELECT COUNT(*) AS count FROM control_state WHERE key GLOB 'internal_signed_news_score_v1:*'").get() as any).count).toBe(81);
 }finally{db.close();}
});
