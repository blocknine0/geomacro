import test from "node:test";
import assert from "node:assert/strict";
import {persistRiskGateAuditReceipt} from "../../workers/control-plane/src/risk-gate-audit-receipt.mjs";

function memoryDb({corrupt=false}={}){
 const rows=new Map();
 return {rows,prepare(sql){return {bind(...values){return {
  async run(){
   const [receipt_id,client_id,request_id,request_hash,subject_type,subject_id,
    decision,policy_id,policy_version,evaluated_at,response_hash,execution_authorized,
    audit_receipt_hash,created_at]=values;
   if(!rows.has(receipt_id))rows.set(receipt_id,{receipt_id,client_id,request_id,
    request_hash,subject_type,subject_id,decision,policy_id,policy_version,evaluated_at,
    response_hash:corrupt?"0".repeat(64):response_hash,execution_authorized,
    audit_receipt_hash,created_at});
   return {success:true};
  },
  async first(){return rows.get(values[0])??null;}
 }};}}};
}
const input={client_id:"pilot-v1",request_id:"r-001",request_hash:"a".repeat(64),
 subject_type:"country",subject_id:"USA",decision:"REQUIRE_APPROVAL",
 policy_id:"strict",policy_version:"1",evaluated_at:"2026-11-05T00:00:00.000Z",
 response:{ok:true,execution_authorized:false,risk_gate:{decision:"REQUIRE_APPROVAL"}}};

test("persists and verifies a deterministic append-only audit receipt before response",async()=>{
 const db=memoryDb();
 const first=await persistRiskGateAuditReceipt(db,input);
 const second=await persistRiskGateAuditReceipt(db,input);
 assert.equal(first.audit_receipt_hash,second.audit_receipt_hash);
 assert.equal(db.rows.size,1);
 assert.equal(db.rows.get(first.receipt_id).execution_authorized,0);
 assert.match(first.audit_receipt_hash,/^[a-f0-9]{64}$/);
});

test("fails closed when D1 readback differs from the submitted receipt",async()=>{
 await assert.rejects(()=>persistRiskGateAuditReceipt(memoryDb({corrupt:true}),input),
  /RISK_GATE_AUDIT_READBACK_FAILED/);
});

test("rejects an execution-authorized response",async()=>{
 await assert.rejects(()=>persistRiskGateAuditReceipt(memoryDb(),{
  ...input,response:{...input.response,execution_authorized:true}
 }),/RISK_GATE_AUDIT_INPUT_INVALID/);
});
