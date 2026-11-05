import {test} from "node:test";
import assert from "node:assert/strict";
import {B2_DAILY_LIMITS} from "../../workers/control-plane/src/b2-account-quota.mjs";
import {buildP0bNativeAuthTicketSql,reserveP0bNativeAuthTicket,classifyP0bWranglerD1Failure,safeP0bWranglerD1Hint} from "../ops/reserve-p0b-native-auth-ticket.mjs";
test("native auth quota ticket reuses canonical atomic account ledger",()=>{
 const q=buildP0bNativeAuthTicketSql(new Date("2026-11-05T11:00:00.000Z"));
 assert.match(q.quotaSql,/ON CONFLICT\(day_utc\) DO UPDATE/u);
 assert.match(q.quotaSql,/native_auth_requests = native_auth_requests \+ excluded.native_auth_requests/u);
 assert.match(q.quotaSql,/native_auth_requests \\+ excluded\\.native_auth_requests <= 40/u);
 assert.match(q.receiptSql,/p0b_b2_scope_preflight/u);
 assert.match(q.readbackSql,/2026-11-05/u);assert.equal(q.quotaSql.includes("?"),false);assert.equal(B2_DAILY_LIMITS.NATIVE_AUTH,40);
});
test("D1 reservation requires the atomic ticket and receipt readback",async()=>{
 const calls=[];const result=await reserveP0bNativeAuthTicket({now:new Date("2026-11-05T11:00:00.000Z"),execute:async sql=>{calls.push(sql);if(calls.length===1)return {results:[{total_requests:4,native_auth_requests:2}]};if(calls.length===2)return {success:true};return {results:[{requests:1}]};}});
 assert.equal(result.reserved,true);assert.equal(result.readback_verified,true);assert.equal(result.b2_operation_performed,false);assert.equal(calls.length,3);
});
test("quota refusal stops before receipt creation",async()=>{let n=0;await assert.rejects(()=>reserveP0bNativeAuthTicket({execute:async()=>{n++;return {results:[]}}}),/P0B_B2_NATIVE_AUTH_D1_RESERVATION_REFUSED/u);assert.equal(n,1);});
test("Wrangler D1 failures expose only a safe diagnostic class",()=>{
 assert.equal(classifyP0bWranglerD1Failure({stderr:"no such table: b2_account_daily_request_quota"}),"SQL");
 assert.equal(classifyP0bWranglerD1Failure({stdout:"no such table: b2_account_daily_request_quota"}),"SQL");
 assert.equal(classifyP0bWranglerD1Failure({stderr:"Error 10000: unauthorized"}),"AUTH");
 assert.equal(classifyP0bWranglerD1Failure({stdout:"Error 10000: unauthorized"}),"AUTH");
 assert.equal(classifyP0bWranglerD1Failure({error:{code:"ETIMEDOUT"}}),"TIMEOUT");
 assert.equal(classifyP0bWranglerD1Failure({error:{code:"E2BIG"}}),"SPAWN_E2BIG");
 assert.equal(classifyP0bWranglerD1Failure({status:1,stdout:"",stderr:""}),"NO_OUTPUT");
 assert.equal(classifyP0bWranglerD1Failure({stderr:"opaque"}),"UNKNOWN");
});

test("Wrangler D1 hint strips credentials, URLs and identifiers",()=>{
 const hint=safeP0bWranglerD1Hint({stderr:"Error: token secret-token-123 failed at https://api.example.test/accounts/abc"},["secret-token-123"]);
 assert.doesNotMatch(hint,/secret-token-123|https?:\/\//u);
 assert.match(hint,/Error: token \[REDACTED\] failed at \[URL\]/u);
});

test("Wrangler hint has a sanitized fallback when no error word is present",()=>{
 assert.equal(safeP0bWranglerD1Hint({stdout:"A bounded provider diagnostic"}),"A bounded provider diagnostic");
});
