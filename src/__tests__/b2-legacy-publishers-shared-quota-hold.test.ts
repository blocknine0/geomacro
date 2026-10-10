import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import prettier from "prettier";

const target=[
  {
    file:".github/workflows/intelligence-scored-refresh.yml",
    name:"Intelligence Scored + Current Evidence",
    job:"Publish verified scored context plus certified current observations to B2",
    id:"intelligence_scored_legacy_recovery",
  },
  {
    file:".github/workflows/b2-agent-governed-modules-snapshot.yml",
    name:"B2 governed agent modules snapshot maintenance",
    job:"Publish fresh governed derived module snapshot via bounded direct Postgres export",
    id:"governed_agent_modules_legacy_recovery",
  },
  {
    file:".github/workflows/intelligence-fastlane-publication.yml",
    name:"Intelligence Fastlane Publication Sync",
    job:"Publish canonical fastlane scores when public B2 state lags",
    id:"intelligence_fastlane_legacy_recovery",
  },
];
const canonical=readFileSync(".github/workflows/intelligence-orchestrator.yml","utf8");
const country=readFileSync(".github/workflows/b2-country-gro-continuity.yml","utf8");
const client=readFileSync("scripts/ops/b2-s3-client.mjs","utf8");

describe("#1827 Supabase-frozen B2 legacy publishers never exhaust free-tier global account quota",()=>{
  it.each(target)("parses $name YAML and removes all automatic stale B2 writes",async item=>{
    const yaml=readFileSync(item.file,"utf8");
    const parsed=await prettier.format(yaml,{parser:"yaml"});
    expect(parsed).toContain(item.name);
    expect(yaml).toContain("on:\n  workflow_dispatch: {}");
    expect(yaml).not.toContain("\n  schedule:");
    expect(yaml).not.toContain("\n  push:");
    expect(yaml).not.toContain("\n  workflow_run:");
    expect(yaml).toContain("github.ref == 'refs/heads/main'");
    expect(yaml).toContain("github.event_name == 'workflow_dispatch'");
    expect(yaml).toContain(item.job);
  });

  it.each(target)("$name can manually recover only with a working canonical D1 B2 quota ticket",item=>{
    const yaml=readFileSync(item.file,"utf8");
    expect(yaml).toContain('B2_ACCOUNT_QUOTA_REQUIRED: "1"');
    expect(yaml).toContain("B2_ACCOUNT_QUOTA_WORKFLOW_ID: "+item.id);
    expect(yaml).toContain('B2_REQUEST_BUDGET: "12"');
    expect(yaml).toContain("CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}");
    expect(yaml).toContain("CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}");
    expect(yaml).toContain("D1_DATABASE_NAME: geomacro-control-plane");
    expect(yaml).toContain('wrangler@${WRANGLER_VERSION}');
    expect(yaml).toContain('echo "D1_DATABASE_ID=$id" >> "$GITHUB_ENV"');
    const idIndex=yaml.indexOf('echo "D1_DATABASE_ID=$id" >> "$GITHUB_ENV"');
    const writerIndex=yaml.indexOf(item.job);
    expect(idIndex).toBeGreaterThan(0);
    expect(writerIndex).toBeGreaterThan(idIndex);
    expect(yaml).not.toContain("B2_ACCOUNT_QUOTA_REQUIRED: \"0\"");
    expect(yaml).toContain("B2_ARCHIVE_READ_KEY_ID");
    expect(yaml).toContain("B2_ARCHIVE_READ_APPLICATION_KEY");
    expect(yaml).not.toContain("storage.objects");
  });

  it("preserves account-wide quota BEFORE each canonical B2 request and fails closed on D1 denial",()=>{
    expect(client).toContain('process.env.B2_ACCOUNT_QUOTA_REQUIRED === "1"');
    expect(client).toContain("createB2D1AccountGovernor()");
    expect(client).toContain("B2_REQUEST_BUDGET_EXHAUSTED");
    expect(client).toContain("const globalAccountGovernor");
    const legacy=readFileSync(
      "scripts/ops/b2-d1-account-governor.mjs","utf8");
    expect(legacy).toContain("reserveB2AccountQuota");
    expect(legacy).toContain("B2_GLOBAL_DAILY_QUOTA_EXHAUSTED");
    expect(legacy).toContain("B2_ACCOUNT_GLOBAL_QUOTA_CONFIGURATION_REQUIRED");
  });

  it("keeps the separate 90-min D1-ledger governed orchestrator without frozen SQL writes",()=>{
    expect(canonical).toContain('cron: "47 0,3,6,9,12,15,18,21 * * *"');
    expect(canonical).toContain('B2_ACCOUNT_QUOTA_REQUIRED: "1"');
    expect(canonical).toContain("B2_ACCOUNT_QUOTA_WORKFLOW_ID: intelligence_orchestrator");
    expect(canonical).toContain("Run due intelligence tasks serially");
    expect(country).toContain("D1 signed GRO read-only coverage");
    expect(country).toContain('github.event.inputs.mode == \'publisher_recovery\'');
  });
});
