import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {SHADOW_0204_READONLY_QUERIES,validateReadonlyCommands,
 safeCheckResult} from "../ops/step3-shadow-0204-readonly-diagnostic.mjs";

const runner=readFileSync(
 "scripts/ops/run-step3-protected-d1-migrations.mjs","utf8");
const probe=readFileSync(
 "scripts/ops/step3-shadow-0204-readonly-diagnostic.mjs","utf8");
const workflow=readFileSync(
 ".github/workflows/step3-shadow-0204-readonly-diagnostic.yml","utf8");

test("0204 physical probe contains only fixed read-only SQL",()=>{
 assert.equal(validateReadonlyCommands(),true);
 assert.equal(SHADOW_0204_READONLY_QUERIES.length,7);
 for(const [name,sql] of SHADOW_0204_READONLY_QUERIES){
  assert.match(name,/^[a-z0-9_]+$/u);
  assert.match(sql,/^(?:SELECT|EXPLAIN QUERY PLAN SELECT|PRAGMA integrity_check)/u);
 }
 assert.equal(validateReadonlyCommands([["unsafe","DELETE FROM x"]]),false);
 assert.equal(validateReadonlyCommands([["unsafe","PRAGMA journal_mode=OFF"]]),false);
 assert.doesNotMatch(probe,/"d1","migrations","apply"|--apply|--file|--command",process\.env/u);
});
test("provider readback never claims an integrity PASS for missing or failed data",()=>{
 const ok=[{success:true,results:[{integrity_check:"ok"}],
  meta:{rows_read:2,rows_written:0}}];
 const bad=[{success:true,results:[{integrity_check:"corruption"}],
  meta:{rows_read:2,rows_written:0}}];
 assert.equal(safeCheckResult("osint_full_integrity",0,ok).full_integrity_exact_ok,true);
 assert.equal(safeCheckResult("osint_full_integrity",0,bad).full_integrity_exact_ok,false);
 assert.equal(safeCheckResult("osint_full_integrity",1,ok).kind,"HOLD");
 assert.equal(safeCheckResult("osint_full_integrity",0,[
  {success:true,results:[],meta:{rows_read:2,rows_written:1}}
 ]).kind,"HOLD");
});
test("real signed Shadow receipts are strict newline-terminated JSON",()=>{
 assert.ok(runner.includes('writeFileSync(path,JSON.stringify(output,null,2)+"\\n",{mode:0o600});'));
 assert.ok(!runner.includes('writeFileSync(path,JSON.stringify(output,null,2)+"\\\\n",{mode:0o600});'));
 assert.match(runner,/last_migration_checkpoint/u);
 assert.match(runner,/last_verification_checkpoint/u);
 assert.match(runner,/classifyStep3ProviderCommand/u);
 assert.match(runner,/classifyStep3ProviderExit/u);
 assert.doesNotMatch(runner,/catch\{fail\("PROVIDER_OR_COMMAND_UNAVAILABLE"\)\}/u);
});
test("provider diagnosis runs only after main push with separate strict monthly gate",()=>{
 assert.match(workflow,/github\.event_name == 'push'/u);
 assert.match(workflow,/github\.ref == 'refs\/heads\/main'/u);
 assert.match(workflow,/environment: production/u);
 assert.match(workflow,/node scripts\/ops\/check-d1-paid-monthly-headroom\.mjs --check/u);
 assert.match(workflow,/node scripts\/ops\/step3-shadow-0204-readonly-diagnostic\.mjs/u);
 assert.match(workflow,/config\/d1-hotspot-v2-canary\.hold/u);
 assert.match(workflow,/D1_DATABASE_ID.*GEOMACRO_D1_SHADOW_DATABASE_ID/u);
 assert.match(workflow,/if: always\(\)/u);
 assert.doesNotMatch(workflow,/run-step3-protected-d1-migrations\.mjs --apply/u);
});
