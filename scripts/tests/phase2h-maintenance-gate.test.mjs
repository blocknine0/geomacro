import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const path=".github/workflows/phase2h-private-raw-archive.yml";
test("Phase 2H B2 workflow requires provider maintenance=true and four quota-first UTC slots",()=>{
 const yaml=readFileSync(path,"utf8");
 assert.match(yaml,/cron: "3 0,6,12,18 \* \* \*"/u);
 assert.match(yaml,/maintenance: \$\{\{ steps\.provider\.outputs\.maintenance \}\}/u);
 assert.match(yaml,/needs\.quota-admission\.outputs\.maintenance == 'true'/u);
 assert.match(yaml,/PHASE2H_PROVIDER_MAINTENANCE: \$\{\{ needs\.quota-admission\.outputs\.maintenance \}\}/u);
 assert.doesNotMatch(yaml,/needs\.quota-admission\.outputs\.structural_snapshot/u);
 assert.doesNotMatch(yaml,/\n  push:\s/u);
 assert.match(yaml,/B2_REQUEST_BUDGET: "12"/u);
});
