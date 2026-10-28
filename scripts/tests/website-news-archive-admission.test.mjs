import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const workflow=readFileSync(new URL("../../.github/workflows/website-derived-news-continuity.yml",import.meta.url),"utf8");
const block=workflow.split("  archive-only-when-d1-held:")[1]?.split("\n  refresh-derived-news:")[0]??"";

test("archive-only resumes after trusted deployed archive during D1 quota HELD",()=>{
  assert.ok(block.length>1000);
  for(const required of [
    "needs: quota-admission",
    "needs.quota-admission.result == 'success'",
    "needs.quota-admission.outputs.research == 'false'",
    "github.event_name == 'schedule'",
    "github.event_name == 'workflow_dispatch'",
    "github.event_name == 'workflow_run'",
    "github.event.workflow_run.conclusion == 'success'",
    "github.event.workflow_run.path == '.github/workflows/deploy-permanent-public-finds-archive.yml'",
    "github.event.workflow_run.head_repository.full_name == 'blocknine0/geomacro'",
    "github.event.workflow_run.head_branch == 'main'",
    "github.repository == 'blocknine0/geomacro'",
    "github.ref == 'refs/heads/main'",
    'GEOMACRO_DERIVED_ARCHIVE_ONLY: "1"',
    "bun scripts/ops/publish-website-derived-news.ts",
    "node scripts/ops/publish-permanent-derived-news-archive.mjs",
  ])assert.ok(block.includes(required),`Missing restricted archive prerequisite: ${required}`);
});
test("quota-held archive remains D1-write-free and cannot run on untrusted pushes",()=>{
  // Enforce denial before any publisher attempts; never bypass D1 governor
  // and never begin a parallel publisher during ordinary main pushes.
  const condition=block.split("    if: >-")[1]?.split("\n    runs-on:")[0]??"";
  assert.ok(condition.includes("needs.quota-admission.outputs.research == 'false'"));
  assert.ok(!condition.includes("github.event_name == 'push'"));
  assert.ok(block.includes("GEOMACRO_DERIVED_ARCHIVE_ONLY"));
  assert.ok(!block.includes("GEOMACRO_COMMERCE_LEDGER_TOKEN"));
});
test("admitted publisher still uses the identical canonical archive-to-D1 reconciliation path",()=>{
  const admitted=workflow.split("  refresh-derived-news:")[1]?.split("\n  private-b2-derived-news-acceptance:")[0]??"";
  assert.ok(admitted.includes("needs.quota-admission.outputs.research == 'true'"));
  assert.ok(admitted.includes("bun scripts/ops/reconcile-website-news-to-d1.ts"));
  assert.ok(admitted.includes("node --test scripts/tests/website-news-canonical-reconciliation.test.mjs"));
  assert.ok(!admitted.includes("PREDGE_RESEARCH_NEWS_TOKEN"));
});
