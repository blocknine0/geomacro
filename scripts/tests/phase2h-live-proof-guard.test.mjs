import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const workflow=readFileSync(new URL("../../.github/workflows/phase2h-private-raw-archive.yml",import.meta.url),"utf8");
const runner=readFileSync(new URL("../ops/phase2h-permanent-production-acceptance.mjs",import.meta.url),"utf8");
test("live B2 archival cannot publish checked-in specimen as accepted proof",()=>{
 assert.match(workflow,/rm -f artifacts\/derived-news\/phase2h-permanent-production-acceptance\.json/u);
 assert.match(workflow,/node scripts\/ops\/phase2h-permanent-production-acceptance\.mjs/u);
 assert.match(runner,/status:"PRODUCTION_B2_ARCHIVE_NOT_VERIFIED"/u);
 assert.match(runner,/incremental_batch_proof_pass:false/u);
 assert.match(runner,/actual_b2_readback_verified:false/u);
 assert.match(runner,/commercial_rights_verified:false,payments:0/u);
 assert.match(runner,/writeSummary\(\{/u);
 assert.match(runner,/process\.exitCode=3/u);
});
