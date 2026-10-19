import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const s=readFileSync(".github/workflows/predge-shared-d1-news-live-acceptance.yml","utf8");
describe("read-only Predge pilot parity on real D1 news",()=>{
  it("triggers on the real hourly publisher and allows owner dispatch",()=>{
    expect(s).toContain("Website Derived News Continuity");
    expect(s).toContain("types: [completed]");
    expect(s).toContain("workflow_dispatch: {}");
    expect(s).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(s).toContain("github.event.workflow_run.head_sha == github.sha");
  });
  it("does not introduce a second paid/raw/private data pipeline",()=>{
    expect(s).toContain("node scripts/ops/verify-shared-derived-news-live.mjs");
    expect(s).toContain("same_journal_ids_verified");
    expect(s).not.toMatch(/^\s+B2_[A-Z_]+:\s*\$\{\{\s*secrets\./m);
    expect(s).not.toContain("COINBASE");
    expect(s).not.toContain("wrangler deploy");
    expect(s).not.toContain("d1 execute");
    expect(s).not.toContain("INTELLIGENCE_ORCHESTRATOR_FORCE_TASKS");
    expect(s).not.toContain("SUPABASE_SERVICE_ROLE_KEY:");
  });
});
