import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {test} from "node:test";
import assert from "node:assert/strict";

const root=new URL("../../workers/control-plane/migrations/",import.meta.url);
const migrate=db=>{
  db.exec("PRAGMA foreign_keys = ON;");
  for(const name of ["0090_customer_canonical_d1.sql","0091_customer_canonical_integrity_triggers.sql"])
    db.exec(readFileSync(new URL(name,root),"utf8"));
};
const mkUser=(db)=>{
 db.prepare("INSERT INTO users(id,email,email_verified_at) VALUES(?,?,?)")
   .run("customer-test-0001","sample@example.invalid","2026-01-01T00:00:00.000Z");
};
const funding=(db)=>{
 db.prepare("INSERT INTO customer_payment_receipts(receipt_id,user_id,provider,environment,provider_event_id,sku,amount_minor_units,currency,settled_at,verified_at,verification_sha256) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
  .run("receipt-test-0001","customer-test-0001","paypal","live","capture-test-0001","starter_dev",900,"USD","2026-01-01T00:00:00.000Z","2026-01-01T00:01:00.000Z","a".repeat(64));
 const end=new Date(Date.now()+86_400_000).toISOString();
 const start=new Date(Date.now()-60_000).toISOString();
 db.prepare("INSERT INTO customer_entitlement_grants(grant_id,user_id,receipt_id,tier,contract_version,starts_at,expires_at,status) VALUES(?,?,?,?,?,?,?,?)")
  .run("grant-test-0001","customer-test-0001","receipt-test-0001","starter_dev","geomacro.credit-v1",start,end,"active");
 db.prepare("INSERT INTO credit_ledger(event_id,user_id,event_type,delta_credits,receipt_id) VALUES(?,?,?,?,?)")
  .run("funding-test-0001","customer-test-0001","funding",1000,"receipt-test-0001");
 return end;
};

test("canonical D1 schema is SQLite-compatible and idempotent",()=>{
 const db=new DatabaseSync(":memory:");
 migrate(db);migrate(db);
 for(const name of ["users","sessions","credit_ledger","api_keys",
   "customer_payment_receipts","customer_entitlement_grants","customer_d1_integrity_probe"]){
  const row=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
  assert.equal(row?.name,name);
 }
 for(const name of ["users","sessions","credit_ledger","api_keys"])
  assert.equal(db.prepare("SELECT count(*) AS n FROM "+name).get().n,0);
 db.close();
});

test("registration is never funded; receipt+grant required; debit cannot overdraw",()=>{
 const db=new DatabaseSync(":memory:");migrate(db);mkUser(db);
 assert.throws(()=>db.prepare("INSERT INTO credit_ledger(event_id,user_id,event_type,delta_credits,receipt_id) VALUES(?,?,?,?,?)")
  .run("funding-test-0001","customer-test-0001","funding",1000,"unverified-receipt"),/VERIFIED_ACTIVE_PAYMENT_GRANT_REQUIRED|FOREIGN KEY/);
 assert.throws(()=>db.prepare("INSERT INTO api_keys(key_id,user_id,hmac_sha256,expires_at) VALUES(?,?,?,?)")
  .run("key-test-unfunded-01","customer-test-0001","b".repeat(64),new Date(Date.now()+3600000).toISOString()),/VERIFIED_PAYMENT_ENTITLEMENT_REQUIRED/);
 funding(db);
 assert.equal(db.prepare("SELECT SUM(delta_credits) AS balance FROM credit_ledger").get().balance,1000);
 assert.throws(()=>db.prepare("INSERT INTO credit_ledger(event_id,user_id,event_type,delta_credits,request_id,capability) VALUES(?,?,?,?,?,?)")
  .run("debit-overdraw-0001","customer-test-0001","debit",-1001,"request-overdraw","intelligence_query"),/INSUFFICIENT_VERIFIED_CREDITS/);
 db.prepare("INSERT INTO credit_ledger(event_id,user_id,event_type,delta_credits,request_id,capability) VALUES(?,?,?,?,?,?)")
  .run("debit-test-0001","customer-test-0001","debit",-1,"request-test-0001","intelligence_query");
 assert.throws(()=>db.prepare("INSERT INTO credit_ledger(event_id,user_id,event_type,delta_credits,request_id,capability) VALUES(?,?,?,?,?,?)")
  .run("debit-test-0002","customer-test-0001","debit",-1,"request-test-0001","intelligence_query"),/UNIQUE/);
 assert.throws(()=>db.prepare("DELETE FROM credit_ledger").run(),/CUSTOMER_LEDGER_APPEND_ONLY/);
 db.close();
});

test("API key issuance requires verified paid grant and forbids immediate replay, reenable",()=>{
 const db=new DatabaseSync(":memory:");migrate(db);mkUser(db);
 const end=funding(db);
 db.prepare("INSERT INTO api_keys(key_id,user_id,hmac_sha256,expires_at) VALUES(?,?,?,?)")
  .run("key-customer-test-01","customer-test-0001","c".repeat(64),end);
 assert.throws(()=>db.prepare("INSERT INTO api_keys(key_id,user_id,hmac_sha256,expires_at) VALUES(?,?,?,?)")
  .run("key-customer-test-02","customer-test-0001","d".repeat(64),end),/KEY_CREATION_COOLDOWN/);
 db.prepare("UPDATE api_keys SET revoked_at=? WHERE key_id=?")
  .run("2026-01-01T00:00:00.000Z","key-customer-test-01");
 assert.throws(()=>db.prepare("UPDATE api_keys SET revoked_at=NULL WHERE key_id=?")
  .run("key-customer-test-01"),/CUSTOMER_KEY_IMMUTABLE_OR_REVOKED/);
 assert.throws(()=>db.prepare("DELETE FROM customer_payment_receipts").run(),/CUSTOMER_PAYMENT_RECEIPT_IMMUTABLE/);
 db.close();
});

test("D1 probe writes never alter payment, ledger, key, or customer rows",()=>{
 const db=new DatabaseSync(":memory:");migrate(db);
 db.prepare("INSERT INTO customer_d1_integrity_probe(probe_id) VALUES(?)").run("no-funds-test-01");
 assert.equal(db.prepare("SELECT count(*) AS n FROM customer_d1_integrity_probe").get().n,1);
 db.prepare("DELETE FROM customer_d1_integrity_probe WHERE probe_id=?").run("no-funds-test-01");
 for(const name of ["users","sessions","credit_ledger","api_keys","customer_payment_receipts"])
  assert.equal(db.prepare("SELECT count(*) AS n FROM "+name).get().n,0);
 db.close();
});
