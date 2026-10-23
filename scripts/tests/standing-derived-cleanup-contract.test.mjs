import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
test("protected derived & complete GRI review cleanup stays syntactically valid",()=>{
 const workflow=readFileSync(".github/workflows/standing-delegated-derived-attestation.yml","utf8");
 const marker="      - name: Delete temporary receipt bytes\n        if: always()\n        run: |\n";
 assert.equal(workflow.split(marker).length,2);
 const tail=workflow.split(marker)[1];
 const script=tail.split("\n").filter(line=>line.startsWith("          ")).
  map(line=>line.slice(10)).join("\n")+"\n";
 const result=spawnSync("bash",["-n"],{input:script,encoding:"utf8"});
 assert.equal(result.status,0,result.stderr);
 for(const expected of ["GEOMACRO_VERIFIED_DERIVED_RECEIPT_PATH",
  "GEOMACRO_DELEGATED_RECEIPT_OUTPUT_PATH",
  "gri-auto-policy-derived.json","complete-intelligence-gri-review.json"])
  assert.ok(script.includes(expected));
 assert.match(script,/set -euo pipefail/u);
});
