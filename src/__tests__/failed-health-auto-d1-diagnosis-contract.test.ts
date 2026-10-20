import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";

describe("automatic read-only P0 diagnosis when exact-main website health fails",()=>{
 const diagnostic=readFileSync(".github/workflows/public-hot-serving-diagnostic.yml","utf8");
 const health=readFileSync(".github/workflows/production-website-health.yml","utf8");
 it("wakes from an actual failed trusted-main health run even after a later main merge",()=>{
   expect(health).toContain("name: Production Website Health");
   expect(diagnostic).toContain('workflows: ["Production Website Health"]');
   expect(diagnostic).toContain("types: [completed]");
   for(const gate of [
     "github.repository == 'blocknine0/geomacro'",
     "github.ref == 'refs/heads/main'",
     "github.event_name == 'workflow_dispatch'",
     "github.event_name == 'workflow_run'",
     "github.event.workflow_run.conclusion == 'failure'",
     "github.event.workflow_run.event == 'push'",
     "github.event.workflow_run.event == 'schedule'",
     "github.event.workflow_run.event == 'workflow_dispatch'",
     "github.event.workflow_run.head_branch == 'main'",
     "github.event.workflow_run.head_repository.full_name == 'blocknine0/geomacro'",
     "github.event.workflow_run.head_sha != ''",
   ])expect(diagnostic).toContain(gate);
   // A failed trusted publish of yesterday's main must diagnose today's
   // canonical main rather than silently skip on a SHA race.
   expect(diagnostic).not.toContain("github.event.workflow_run.head_sha == github.sha");
   expect(diagnostic).toContain("github.event.workflow_run.head_sha != ''");
   // Folded YAML expressions are expressions, not shell scripts: inline
   // hash-prefixed comment lines would invalidate the workflow before jobs.
   const expr=diagnostic.split("    if: >-\n")[1]?.split("    runs-on:")[0];
   expect(expr).toBeTruthy();
   expect(expr).not.toMatch(/^\s*#/m);
 });
 it("preserves genuine failure, independent metadata readback and zero-funds isolation",()=>{
   expect(diagnostic).toContain("node scripts/ops/diagnose-public-hot-serving.mjs");
   expect(diagnostic).toContain("node scripts/ops/classify-d1-hot-metadata.mjs");
   expect(diagnostic).toContain("if: always()");
   expect(diagnostic).toContain("SELECT product, schema_name, generated_at, source_as_of, expires_at");
   expect(diagnostic).not.toContain("SELECT * FROM public_b2_hot_snapshot");
   expect(diagnostic).toContain("permissions:\n  contents: read");
   expect(diagnostic).not.toContain("B2_APPLICATION_KEY: ${{ secrets.");
   expect(diagnostic).not.toContain("SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.");
   expect(diagnostic).not.toContain("COINBASE_API_KEY: ${{ secrets.");
   expect(health).toContain("Verify live build marker matches canonical main");
   expect(health).toContain("Verify B2 production serving health");
   expect(health).toContain('Expected HTTP 200 from canonical /api/health?deep=1');
   expect(health).toContain("LIVE_DEPLOYMENT_SHA_MISMATCH");
 });
});
