import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,existsSync} from "node:fs";
import {parseCanonical195Codes,rollupCountry195Proofs}
 from "../lib/country-195-proof-rollup.mjs";
const registry=readFileSync("src/lib/canonical-country-registry-195.ts","utf8");
const codes=parseCanonical195Codes(registry);
const cli=resolve("scripts/ops/report-country-195-commercial-readiness.mjs");
function fixture(){
 const cwd=mkdtempSync(join(tmpdir(),"geomacro-195x3-real-cli-"));
 mkdirSync(join(cwd,"src/lib"),{recursive:true,mode:0o700});
 mkdirSync(join(cwd,"artifacts/country-195"),{recursive:true,mode:0o700});
 writeFileSync(join(cwd,"src/lib/canonical-country-registry-195.ts"),registry,{mode:0o600});
 const report=rollupCountry195Proofs([],codes,{now:new Date()});
 writeFileSync(join(cwd,"artifacts/country-195/rolling-proof-summary.v1.json"),
  JSON.stringify(report),{mode:0o600});
 return cwd;
}
test("protected CLI ACTUALLY writes 585 strict source/reviewer gap cells, not a silent successful no-op",()=>{
 const cwd=fixture();
 try{
  const proc=spawnSync(process.execPath,[cli],{
   cwd,encoding:"utf8",timeout:15000,maxBuffer:512000,
   env:{...process.env,GITHUB_REPOSITORY:"blocknine0/geomacro",
    GITHUB_REF:"refs/heads/main",GITHUB_RUN_ID:"12345"},
  });
  assert.equal(proc.status,0,proc.stderr.slice(-800));
  const receiptFile=join(cwd,"artifacts/country-195/commercial-original-review-gaps.v1.json");
  assert.equal(existsSync(receiptFile),true);
  const receipt=JSON.parse(readFileSync(receiptFile,"utf8"));
  assert.equal(receipt.exact_cells_evaluated,585);
  assert.equal(receipt.private_independent_reviewer_material_supplied_in_this_census,false);
  assert.equal(receipt.both_prepublication_gates_verified,0);
  assert.equal(receipt.signed_commercial_delivery_cells_verified,0);
  assert.equal(receipt.x402_charge_authorized,false);
  const summary=JSON.parse(proc.stdout.trim());
  assert.equal(summary.examined,585);
  assert.equal(summary.paid_delivery_enabled,false);
 }finally{rmSync(cwd,{recursive:true,force:true})}
});
test("untrusted branch cannot write even a prepublication artifact",()=>{
 const cwd=fixture();
 try{
  const proc=spawnSync(process.execPath,[cli],{
   cwd,encoding:"utf8",timeout:15000,maxBuffer:512000,
   env:{...process.env,GITHUB_REPOSITORY:"blocknine0/geomacro",
    GITHUB_REF:"refs/heads/feature",GITHUB_RUN_ID:"12345"},
  });
  assert.equal(proc.status,3);
  assert.equal(existsSync(join(cwd,
   "artifacts/country-195/commercial-original-review-gaps.v1.json")),false);
 }finally{rmSync(cwd,{recursive:true,force:true})}
});
