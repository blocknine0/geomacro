import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/gri-governance.yml",
  "utf8",
);
const publicProofJob = workflow.match(
  /^  public-proof:\n([\s\S]*?)(?=\n  [a-z0-9_-]+:\n|\s*$)/m,
)?.[0] ?? "";

describe("GRI public proof consistency workflow contract", () => {
  it("keeps manual, scheduled and relevant main-change revalidation", () => {
    expect(workflow).toContain("workflow_dispatch: {}");
    expect(workflow).toContain('cron: "23 */2 * * *"');
    expect(workflow).toContain("push:");
    expect(workflow).toContain("branches: [main]");
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
