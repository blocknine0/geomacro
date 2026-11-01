import {test} from "node:test";
import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
test("Phase2H publisher diagnostic distinguishes original D1 evidence failures without raw exception disclosure",()=>{
 const s=readFileSync("scripts/ops/publish-website-derived-news.ts","utf8");
 for(const code of ["PHASE2H_PRIVATE_PER_ORIGINAL_EVIDENCE_MISMATCH",
  "PHASE2H_PRIVATE_FIVE_PART_VERSION_RECEIPT_MISMATCH",
  "PHASE2H_PRIVATE_BATCH_EVIDENCE_INCOMPLETE",
  "PHASE2H_PRIVATE_D1_READBACK_MISMATCH",
  "PHASE2H_PRIVATE_D1_PERSIST_UNAVAILABLE",
  "PHASE2H_PRIVATE_INTAKE_AUTH_REQUIRED"]){
   assert(s.includes('"'+code+'"'));
 }
 assert(s.includes("safe.has(error.message)"));
 assert(s.includes("PHASE2H_PRIVATE_RAW_TRANSPORT_OR_UNKNOWN_FAILURE"));
 assert(!s.includes("console.error(error)"));
 assert(!s.includes("console.error(error.message)"));
});
