import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const workflow=readFileSync(".github/workflows/private-global-osint-15m.yml","utf8");
const held=workflow.split("  stage-private-sources-when-d1-held:")[1]?.split("\n  replay-quota-held-encrypted-spool:")[0]??"";

test("quota-held private collection publishes only a bounded source-neutral sidecar to the existing static archive",()=>{
 assert.ok(held.length>1000);
 for(const required of [
  "needs.quota-admission.outputs.source_intake != 'true'",
  "environment: production",
  "group: geomacro-permanent-news-publication",
  "permissions:\n      contents: write",
  "GEOMACRO_OSINT_PUBLIC_CANDIDATES_FILE:",
  "scripts/ops/private-osint-stage-held.ts",
  "scripts/ops/publish-permanent-derived-news-archive.mjs",
  "GEOMACRO_PUBLIC_ARCHIVE_ZERO_D1: \"1\"",
  "d1_reads_performed == 0",
  "git worktree add --detach",
  "push origin HEAD:refs/heads/geomacro-permanent-finds-archive",
  "workers/public-finds-archive",
  "verifyConvergedPublicStaticArchiveReadback",
  "zero_d1_mode:true",
 ])assert.ok(held.includes(required),`Missing held publication guarantee: ${required}`);
 assert.ok(!held.includes("D1_WRITE"));
 assert.ok(!held.includes("predge_paid_risk_gate"));
});

test("the held lane retains the existing encrypted private artifact and truthful source-health receipt",()=>{
 assert.ok(held.includes("Retain only encrypted original-clock observations, never plaintext"));
 assert.ok(held.includes("geomacro-encrypted-private-osint-held"));
 assert.ok(held.includes("Require honest three-category source health during D1 quota HOLD"));
 assert.ok(held.includes("assert-private-osint-three-category-live-receipt.mjs"));
 assert.ok(held.includes("GEOMACRO_COMMERCE_LEDGER_TOKEN"));
 assert.ok(held.includes("public_source_text_included:false"));
});

test("OSINT Website Intelligence keeps the existing card layout and omits the unwanted watch/no-score badge",()=>{
 const renderer=readFileSync("workers/control-plane/src/website-derived-intelligence.mjs","utf8");
 assert.ok(!renderer.includes("UNVERIFIED WATCH · NO SCORE"));
 assert.ok(renderer.includes('"GEOMACRO FINDS"'));
 assert.ok(renderer.includes("<article><div class=\"label\">"));
});
