import test from "node:test";
import assert from "node:assert/strict";
import {recordPredgeDeliveryEvent} from "../../workers/control-plane/src/predge-delivery-ledger.mjs";

function fakeDb(){
 const state={sql:null,args:null,fail:false};
 return {state,prepare(sql){state.sql=sql;return {bind(...args){state.args=args;return {
  async run(){if(state.fail)throw Error("D1 unavailable");return {success:true}}
 }}}}};
}
const base={endpoint_version:"v2",request_id:"predge-req-1",gro_id:"a".repeat(64),
 receipt_sha256:"b".repeat(64),day_utc:"2026-11-18",country_iso3:"USA",
 category:"GEOPOLITICS",tier:"STANDARD",delivery_status:"DELIVERED",
 created_at:"2026-11-18T10:00:00.000Z"};

test("delivery ledger records exact tier price, net, fee and outcome",async()=>{
 const db=fakeDb();
 assert.equal(await recordPredgeDeliveryEvent(db,base),true);
 assert.match(db.state.sql,/INSERT OR IGNORE INTO predge_risk_gate_delivery_ledger/u);
 assert.equal(db.state.args[7],"GEOPOLITICS");
 assert.equal(db.state.args[8],"STANDARD");
 assert.equal(db.state.args[9],0.20);
 assert.equal(db.state.args[10],0.15);
 assert.equal(db.state.args[11],0.05);
 assert.equal(db.state.args[12],"DELIVERED");
});

test("delivery ledger rejects invalid category and fails open on provider errors",async()=>{
 const db=fakeDb();
 assert.equal(await recordPredgeDeliveryEvent(db,{...base,category:"OTHER"}),false);
 db.state.fail=true;
 assert.equal(await recordPredgeDeliveryEvent(db,base),false);
});
