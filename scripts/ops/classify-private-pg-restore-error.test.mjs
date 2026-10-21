import {test} from "node:test";
import assert from "node:assert/strict";
import {classifyPrivatePgRestoreLog} from "./classify-private-pg-restore-error.mjs";
test("first real PG error wins; sensitive identifier absent",()=>{
  const log = [
   "pg_restore: from TOC entry 991; 1255 2345 FUNCTION public sensitive_customer_function postgres",
   'pg_restore: error: could not execute query: ERROR:  function auth.uid() does not exist',
   'Command was: CREATE FUNCTION sensitive_customer_function ...',
   'pg_restore: error: could not execute query: ERROR: relation \"private_payment_events\" does not exist',
  ].join("\n");
  const r=classifyPrivatePgRestoreLog(log);
  assert.equal(r.first_server_error_kind,"MISSING_FUNCTION");
  assert.equal(r.missing_known_dependency_class,"AUTH_UID");
  assert.equal(r.error_text_or_object_identifiers_exposed,false);
  const text=JSON.stringify(r);
  assert.ok(!text.includes("sensitive_customer"));
  assert.ok(!text.includes("private_payment_events"));
});
test("whitelist vault missing type; neither database name nor string leaked",()=>{
 const r=classifyPrivatePgRestoreLog('pg_restore: error: ERROR: type vault.weird_secret_type does not exist');
 assert.equal(r.first_server_error_kind,"MISSING_TYPE");
 assert.equal(r.missing_known_dependency_class,"VAULT_SCHEMA");
 assert.ok(!JSON.stringify(r).includes("weird_secret_type"));
});
test("empty/private unrecognized failure refuses assertions",()=>{
 const r=classifyPrivatePgRestoreLog("Archive corrupted with private_article_name");
 assert.equal(r.first_server_error_kind,"NO_RESTORABLE_PG_ERROR_FOUND");
 assert.ok(!JSON.stringify(r).includes("private_article_name"));
});
