import {describe,it,expect,vi} from "vitest";
import {readFileSync} from "node:fs";
import {createHash,generateKeyPairSync,sign as signBytes} from "node:crypto";
import {
 parseRequest,verifyHotGRO,predgeRiskGateD1,
} from "../../workers/control-plane/src/predge-risk-gate-d1.mjs";

const NOW=Date.parse("2026-10-20T17:00:00.000Z");
const TOKEN="f".repeat(64),RESEARCH_TOKEN="a".repeat(64);
const base=JSON.parse(readFileSync("docs/partners/predge/risk-gate-request.json","utf8"));
const corridor=JSON.parse(readFileSync("docs/partners/predge/risk-gate-corridor-request.json","utf8"));
const signedTest=JSON.parse(readFileSync("docs/partners/predge/gro-signed-test-vector.json","utf8"));
const canonical=v=>v===null||typeof v!=="object"?JSON.stringify(v):
 Array.isArray(v)?"["+v.map(canonical).join(",")+"]":
 "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+canonical(v[k])).join(",")+"}";
const sha=v=>createHash("sha256").update(v).digest("hex");
function db(){
 let claim,used=0,callCount=0;
 return {get used(){return used},get calls(){return callCount},
   prepare(q){
     return {bind(...args){
       return {
         async run(){
           callCount++;
           if(q.includes("INSERT OR IGNORE INTO risk_gate_d1_requests")){
             if(!claim)claim={request_hash:args[2],state:"PENDING",response_json:null};
           }
           return {success:true};
         },
         async first(){
           callCount++;
           if(q.includes("SELECT request_hash,state,response_json"))return claim;
           if(q.includes("UPDATE risk_gate_d1_requests SET state='CLAIMED'")){
             if(!claim||claim.state!=="PENDING")return null;
             claim.state="CLAIMED";return {request_id:args[1]};
           }
           if(q.includes("INSERT INTO risk_gate_d1_quota")){
             if(used>=100)return null;used++;return {used};
           }
           if(q.includes("FROM country_gro_verified_hot")||q.includes("FROM corridor_gro_verified_hot"))return null;
           return null;
         },
       };
     }};
   }
 };
}
function env(d=db()){return {DB:d,PREDGE_RISK_GATE_TOKEN:TOKEN,
  PREDGE_RESEARCH_NEWS_TOKEN:RESEARCH_TOKEN,CONTROL_PLANE_TOKEN:"c".repeat(64),
  RISK_GATE_VERIFY_KEYS_JSON:JSON.stringify({
    "geomacro-risk-2026-03":{status:"active",public_key_spki_b64:
      "MCowBQYDK2VwAyEAeMsePxig7TEUR3fykcx9wcBqomj9KBuJ/TXTX2QSN2k="}
  })};}
const req=(payload=base,token=TOKEN)=>new Request(
 "https://control.example/v1/partner/predge/risk-gate",{
 method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+token},
 body:JSON.stringify(payload),
});

describe("Supabase-free Predge Risk Gate v1 migration",()=>{
 it("accepts exact supported external parser shapes, excludes spoofed hashes",()=>{
   expect(parseRequest(base,NOW)?.subject).toEqual({type:"country",id:"USA"});
   expect(parseRequest(corridor,NOW)?.subject).toEqual({type:"corridor",id:"IND>ARE"});
   expect(parseRequest({...base,subject:{type:"country",id:"USA"}},NOW)).toBeNull();
   expect(parseRequest({...base,content_hash:"a".repeat(64)},NOW)).toBeNull();
   expect(parseRequest({...base,context_sha256:"a".repeat(64)},NOW)).toBeNull();
   expect(parseRequest({...base,policy:{...base.policy,continue_max_score:80}},NOW)).toBeNull();
 });
 it("rejects absent/reused/exposed/wrong tokens before any DB access",async()=>{
   const d=db(),e=env(d);
   for(const token of [RESEARCH_TOKEN,"b".repeat(64)]){
     const r=await predgeRiskGateD1(req(base,token),e,NOW);
     expect(r.status).toBe(401);
     expect((await r.json()).execution_authorized).toBe(false);
   }
   const configured=await predgeRiskGateD1(req(),{...e,PREDGE_RISK_GATE_TOKEN:RESEARCH_TOKEN},NOW);
   expect(configured.status).toBe(503);
   expect(d.calls).toBe(0);
 });
 it("D1 no GRO fails closed, atomic quota, and same request cannot consume again",async()=>{
   const d=db(),e=env(d);
   const first=await predgeRiskGateD1(req(),e,NOW);
   expect(first.status).toBe(503);
   const body=await first.json();
   expect(body.error).toBe("CURRENT_SIGNED_GRO_UNAVAILABLE");
   expect(body.advisory_decision).toBe("PAUSE");
   expect(body.execution_authorized).toBe(false);
   expect(d.used).toBe(1);
   const duplicate=await predgeRiskGateD1(req(),e,NOW);
   expect(duplicate.status).toBe(409);
   expect(d.used).toBe(1);
 });
 it("never trusts unpinned Ed25519 key even with internally consistent fake signature",async()=>{
   const {publicKey,privateKey}=generateKeyPairSync("ed25519");
   const obj={...signedTest,generated_at:new Date(NOW-30_000).toISOString(),
      expires_at:new Date(NOW+3600000).toISOString(),
      integrity:{...signedTest.integrity,signing_key_id:"attacker-test"},
      verification:{status:"VERIFIED",reason_codes:[],last_verified_at:new Date(NOW).toISOString()},
      commercial_eligibility:{status:"VERIFIED",reason_codes:[]},
      evidence:[{event_id:"fake"}],evidence_summary:{event_count:1,evidence_count:1,independent_source_count:1}};
   const signable={...obj,integrity:{...obj.integrity,payload_hash:null,signature:null}};
   obj.integrity.payload_hash=sha(canonical(signable));
   obj.integrity.signature=signBytes(null,Buffer.from(canonical(signable)),privateKey).toString("base64");
   const json=JSON.stringify(obj);
   const row={archive_write_acknowledged:1,schema_version:"gro-1.1",
     record_sha256:sha(json),payload_hash:obj.integrity.payload_hash,
     signing_key_id:"attacker-test",object_id:obj.object_id,object_json:json,
     generated_at:obj.generated_at,expires_at:obj.expires_at};
   const e={...env(),RISK_GATE_VERIFY_KEYS_JSON:JSON.stringify({
     "attacker-test":{status:"active",public_key_spki_b64:
       publicKey.export({format:"der",type:"spki"}).toString("base64")}
   })};
   expect(await verifyHotGRO(row,e,{type:"country",id:"USA"},NOW)).toBeNull();
   expect(await verifyHotGRO({...row,record_sha256:"1".repeat(64)},e,{type:"country",id:"USA"},NOW)).toBeNull();
 });
 it("asserts website bypassed all previous live Supabase handlers",()=>{
   const route=readFileSync("src/routes/api.risk-gate.ts","utf8");
   const worker=readFileSync("workers/control-plane/src/predge-risk-gate-d1.mjs","utf8");
   const index=readFileSync("workers/control-plane/src/index.mjs","utf8");
   const sql=readFileSync("workers/control-plane/migrations/0020_predge_risk_gate_d1.sql","utf8");
   expect(route).toContain("forwardRiskGateToD1");
   expect(route).not.toContain("handleCommercialExternalRiskGateRequest");
   expect(index).toContain("predgeRiskGateD1(request,env)");
   expect(worker).toContain("evaluateRiskGate(parsed,gro,new Date(now))");
   expect(sql).toContain("risk_gate_d1_quota");
   expect(sql).toContain("PRIMARY KEY(client_id,request_id)");
   expect(worker).not.toContain("requireRiskSupabase(");
 });
});
