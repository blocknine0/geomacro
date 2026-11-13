import test from "node:test";
import assert from "node:assert/strict";
import {
 assertD1DatabaseIdentity,
 PREDGE_0131_DATABASE_ID,
 PREDGE_0131_DATABASE_NAME
} from "../ops/predge-addendum-v2-d1-identity.mjs";

test("accepts Cloudflare D1's single-object database identity response",()=>{
 const payload={success:true,result:{uuid:PREDGE_0131_DATABASE_ID,name:PREDGE_0131_DATABASE_NAME}};
 assert.deepEqual(assertD1DatabaseIdentity(payload),{
  uuid:PREDGE_0131_DATABASE_ID,name:PREDGE_0131_DATABASE_NAME
 });
});

test("rejects failed, mismatched, array-shaped, or incomplete D1 identity responses",()=>{
 const valid={success:true,result:{uuid:PREDGE_0131_DATABASE_ID,name:PREDGE_0131_DATABASE_NAME}};
 for(const payload of [
  {...valid,success:false},
  {...valid,result:{...valid.result,uuid:"wrong-id"}},
  {...valid,result:{...valid.result,name:"wrong-database"}},
  {...valid,result:[valid.result]},
  {...valid,result:null},
  {success:true,result:{uuid:PREDGE_0131_DATABASE_ID}}
 ]){
  assert.throws(()=>assertD1DatabaseIdentity(payload),{
   message:"D1_DATABASE_IDENTITY_MISMATCH"
  });
 }
});

test("pins the production database UUID used by migration 0131",()=>{
 assert.equal(PREDGE_0131_DATABASE_ID,"db057ca9-9f6e-4957-ac28-144f3b798f9b");
});
