import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/gri-governance.yml",
  "utf8",
);
const jobBlock = (source, name) => {
  const header = `  ${name}:\n`;
  const start = source.indexOf(header);
  if (start < 0) return "";
  const boundary = /^  [A-Za-z0-9_-]+:\n/gm;
  let next = boundary.exec(source);
  while (next && next.index <= start) next = boundary.exec(source);
  const end = next ? next.index : source.length;
  return source.slice(start, end);
};
const publicProofJob = jobBlock(workflow, "public-proof");
const orchestratorWorkflow = readFileSync(
  ".github/workflows/intelligence-orchestrator.yml",
  "utf8",
);
const orchestrator = readFileSync(
  "scripts/intelligence-orchestrator.mjs",
  "utf8",
);

describe("GRI public proof consistency workflow contract", () => {
  it("keeps manual proof while scheduling is owned by the master orchestrator", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("23 */2 * * *");
    expect(workflow).not.toContain("push:");
    expect(orchestratorWorkflow).toContain('cron: "7,22,37,52 * * * *"');
    expect(orchestrator).toContain('key: "gri_publish"');
    expect(workflow).toContain("scripts/audit-gri-public-proof-consistency.mjs");
    expect(workflow).toContain("scripts/verify-gri-snapshot-v12.js");
    expect(workflow).toContain("scripts/lib/gri-*.js");
    expect(workflow).toContain("supabase/migrations/**");
    expect(workflow).toContain("bun.lock");
  });

  it("retains the persisted service-role vs public-read proof boundary", () => {
    expect(publicProofJob).toContain("APP_SUPABASE_ANON_KEY");
    expect(publicProofJob).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(publicProofJob).toContain("GRI_METHOD_VERSION: gri-v1.2.0");
    expect(publicProofJob).toContain("GRI_PROOF_VERSION: gri-proof-v1.2.0");
    expect(publicProofJob).toContain('GRI_MAX_PUBLIC_SNAPSHOT_AGE_HOURS: "3"');
    expect(publicProofJob).toContain("Audit persisted public/service GRI parity");
    expect(publicProofJob).toContain("Independently recompute persisted proof");
    expect(publicProofJob).toContain("retention-days: 90");
  });
});
