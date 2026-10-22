import test from "node:test";
import assert from "node:assert/strict";
import {installSafeGriReadyPointers} from "../ops/activate-pallab-suman-signed-automation.mjs";
test("existing 15-min cron activation stores only immutable SHA hints and signed owner envelope",()=>{
 const pkg={reviewedSha:"a".repeat(64),certificatesSha:"b".repeat(64),
  readyAt:"2026-10-23T00:00:00.000Z",
  ownerApprovalBase64:"T".repeat(200)};
 const calls=[];
 const out=installSafeGriReadyPointers(pkg,{run:(cmd,args,stdin)=>{
  calls.push({cmd,args,stdin});return {status:0};
 }});
 assert.equal(out.status,"SIGNED_HUMAN_APPROVAL_AND_POINTERS_INSTALLED");
 assert.equal(out.mainnet_payments,0);
 assert.equal(calls.length,4);
 assert.deepEqual(calls.map(x=>x.args[1]),[
  "GRI_READY_REVIEWED_SHA256",
  "GRI_READY_CERTIFICATES_SHA256",
  "GRI_READY_APPROVED_AT",
  "GEOMACRO_OWNER_HUMAN_SIGNED_ENVELOPE_B64"
 ]);
 assert.equal(calls[3].args.includes("production"),true);
 assert.equal(calls[3].stdin,pkg.ownerApprovalBase64);
 assert.equal(calls.slice(0,3).every(x=>x.stdin===undefined),true);
 assert.equal(calls.every(x=>x.cmd==="gh"),true);
 assert.equal(calls.every(x=>x.args.includes("blocknine0/geomacro")),true);
 assert.equal(JSON.stringify(out).includes(pkg.ownerApprovalBase64),false);
});
test("any failed GitHub secret or variable set blocks successful handoff",()=>{
 const pkg={reviewedSha:"a".repeat(64),certificatesSha:"b".repeat(64),
  readyAt:"2026-10-23T00:00:00.000Z",
  ownerApprovalBase64:"R".repeat(300)};
 let calls=0;
 assert.throws(()=>installSafeGriReadyPointers(pkg,{run:()=>{
  calls++;return {status:calls===2?1:0};
 }}),/GITHUB_PROTECTED_HINT_INSTALL_UNVERIFIED/);
 assert.equal(calls,2);
 assert.throws(()=>installSafeGriReadyPointers({
  ...pkg,reviewedSha:"NO_HASH"
 },{run:()=>{throw Error("must not run");}}),/SAFE_HINT_CONTRACT_INVALID/);
});
