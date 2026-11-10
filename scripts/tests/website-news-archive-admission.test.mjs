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
    "GEOMACRO_DERIVED_ARCHIVE_ONLY: ${{ steps.paid-monthly-derived.outputs.admitted == 'true' && '0' || '1' }}",
    "bun scripts/ops/publish-website-derived-news.ts",
    "node scripts/ops/publish-permanent-derived-news-archive.mjs",
  ])assert.ok(block.includes(required),`Missing restricted archive prerequisite: ${required}`);
});
test("quota-held archive may read at most one complete public journal bundle under snapshot headroom, never write D1",()=>{
 assert.ok(workflow.includes("snapshot_refresh: ${{ steps.budget.outputs.snapshot_refresh }}"));
 // The old snapshot gate remains available. The read-only Paid catchup
 // requires a second fresh monthly provider PASS before any canonical GET.
 const catchupLine=block.split("\n").find(x=>x.includes("GEOMACRO_CANONICAL_D1_CATCHUP:"))??"";
 assert.ok(catchupLine.includes("needs.quota-admission.outputs.snapshot_refresh == 'true'"));
 assert.ok(catchupLine.includes("needs.quota-admission.outputs.canonical_archive_catchup_readonly == 'true'"));
 assert.ok(catchupLine.includes("steps.canonical-readonly-monthly.outputs.admitted == 'true'"));
 assert.ok(block.includes("id: canonical-readonly-monthly"));
 assert.ok(block.includes("node scripts/ops/check-d1-paid-monthly-headroom.mjs --check"));
 assert.ok(block.includes("node scripts/ops/publish-permanent-derived-news-archive.mjs"));
 assert.ok(block.includes('GEOMACRO_COMMERCE_LEDGER_TOKEN: ${{ secrets.GEOMACRO_COMMERCE_LEDGER_TOKEN }}'));
 const onlyCollector=block.split('      - name: Collect once and publish only bounded Paid derived D1 rows when physically admitted')[1]?.split('      - name: Publish append-only permanent Finds archive')[0]??'';
 assert.ok(onlyCollector.includes("GEOMACRO_COMMERCE_LEDGER_TOKEN"));
 assert.ok(onlyCollector.includes("GEOMACRO_PAID_DERIVED_ONLY:"));
 assert.ok(onlyCollector.includes("GEOMACRO_SOURCE_INTAKE_ADMISSION:"));
 assert.ok(block.includes('echo "admitted=false" >> "$GITHUB_OUTPUT"'));
 const src=readFileSync("scripts/ops/publish-website-derived-news.ts","utf8");
 assert.ok(src.includes('const ARCHIVE_ONLY = process.env.GEOMACRO_DERIVED_ARCHIVE_ONLY === "1";'));
 assert.ok(src.includes("if (ARCHIVE_ONLY) {"));
 assert.ok(src.includes("d1_reads:0,d1_writes:0,b2_requests:0,payments:0"));
});
test("monthly-held archive remains D1-write-free and cannot run on untrusted pushes",()=>{
  // Enforce denial before any publisher attempts; never bypass D1 governor
  // and never begin a parallel publisher during ordinary main pushes.
  const condition=block.split("    if: >-")[1]?.split("\n    runs-on:")[0]??"";
  assert.ok(condition.includes("needs.quota-admission.outputs.research == 'false'"));
  // A push must be a protected canonical main change, and only while the
  // existing provider governor explicitly holds research D1 admission.
  assert.ok(condition.includes("github.event_name == 'push'"));
  assert.ok(condition.includes("github.repository == 'blocknine0/geomacro'"));
  assert.ok(condition.includes("github.ref == 'refs/heads/main'"));
  const admitted=workflow.split("  refresh-derived-news:")[1]??"";
  assert.ok(admitted.includes("github.event_name != 'push'"));
  assert.ok(condition.includes("needs.quota-admission.result == 'success'"));
  assert.ok(block.includes("GEOMACRO_DERIVED_ARCHIVE_ONLY"));
  assert.ok(block.includes("node scripts/ops/check-d1-paid-monthly-headroom.mjs --check"));
  assert.ok(block.includes("needs.quota-admission.outputs.paid_derived_news_source_lane == 'true'"));
  assert.ok(block.includes('GEOMACRO_COMMERCE_LEDGER_TOKEN: ${{ secrets.GEOMACRO_COMMERCE_LEDGER_TOKEN }}'));
});
test("admitted publisher still uses the identical canonical archive-to-D1 reconciliation path",()=>{
  const admitted=workflow.split("  refresh-derived-news:")[1]?.split("\n  private-b2-derived-news-acceptance:")[0]??"";
  assert.ok(admitted.includes("needs.quota-admission.outputs.research == 'true'"));
  assert.ok(admitted.includes("bun scripts/ops/reconcile-website-news-to-d1.ts"));
  assert.ok(admitted.includes("node --test scripts/tests/website-news-canonical-reconciliation.test.mjs"));
  assert.ok(!admitted.includes("PREDGE_RESEARCH_NEWS_TOKEN"));
});
