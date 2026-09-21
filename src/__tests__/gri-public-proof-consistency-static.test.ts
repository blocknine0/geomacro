import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const script = read("scripts/audit-gri-public-proof-consistency.mjs");
const workflow = read(".github/workflows/gri-governance.yml");
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
const publicProofJob =
  workflow.match(/^  public-proof:\n([\s\S]*?)(?=\n  [a-z0-9_-]+:\n|\s*$)/m)?.[0] ?? "";
const verifier = read("scripts/verify-gri-snapshot-v12.js");

describe("GRI public proof consistency evidence", () => {
  it("compares the persisted current snapshot across service-role and anon/RLS reads", () => {
    expect(script).toContain('"gri_snapshots"');
    expect(script).toContain("snapshotFieldParity");
    expect(script).toContain("publicReadFreshness");
    expect(script).toContain("contributionMembershipParity");
    expect(script).toContain("dispositionRowParity");
    expect(script).toContain("anonIncludedMatchesContributions");
    expect(script).toContain("validationRunParity");
    expect(script).toContain("validationMetricParity");
    expect(script).toContain('"gri-v1.2.0"');
    expect(script).toContain('"gri-proof-v1.2.0"');
  });

  it("emits sanitized evidence rather than source identities or credential values", () => {
    expect(script).toContain("gri-public-proof-consistency-v1.0.0");
    expect(script).toContain("snapshotAgeHours");
    expect(script).toContain("maxPublicSnapshotAgeHours");
    expect(script).toContain("proofHash");
    expect(script).not.toContain("source_url");
    expect(script).not.toContain("source_domain");
    expect(script).not.toContain("source_name");
    expect(script).not.toMatch(/eyJhbGciOi/);
  });

  it("runs as a recurring read-only evidence workflow and reuses the independent verifier", () => {
    expect(workflow).toContain('cron: "23 */2 * * *"');
    expect(workflow).toContain("workflow_dispatch");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain('GRI_MAX_PUBLIC_SNAPSHOT_AGE_HOURS: "3"');
    expect(workflow).toContain("audit-gri-public-proof-consistency.mjs");
    expect(workflow).toContain("verify-gri-snapshot-v12.js --snapshot-id");
    expect(workflow).toContain("oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6");
    expect(workflow).toContain("bun install --frozen-lockfile --ignore-scripts");
    expect(workflow).toContain("actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a");
    expect(publicProofJob).not.toContain("npm install --no-save");
    expect(publicProofJob).not.toContain("compute-gri-v12.js");
    expect(publicProofJob).not.toContain("cluster-gri-stories-v12.js");
    expect(publicProofJob).not.toContain("insert(");
    expect(publicProofJob).not.toContain("upsert(");
    expect(verifier).toContain("const snapshotArg = args.indexOf('--snapshot-id')");
  });
});
