import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  acceptanceScope,
  evaluateIssue1414Acceptance,
  MASTER_LAUNCH_ISSUE,
} from "../../scripts/lib/issue-1414-closure-guard.mjs";

const workflow = readFileSync(".github/workflows/issue-1414-closure-guard.yml", "utf8");
const runner = readFileSync("scripts/ops/enforce-issue-1414-closure.mjs", "utf8");

// The old filename remains a compatibility path; it now guards #1827.
const headings = [
  "# GEOMACRO — UNIFIED MASTER",
  "## Stage 0",
  ...Array.from({ length: 9 }, (_, i) => "## P" + i),
  "## Migrated inventory: previously open ISSUES (7 of 7)",
  "## Migrated inventory: currently open PRs (12 of 12)",
].join("\n");

const requiredProof = [
  "- [x] Owner mainnet ACK → first real 0.05 USDC x402 paid purchase and signed derived response verified.",
  "- [x] **Federico receiver must return independently verifiable signed approve and ZERO unresolved findings**.",
  "- [x] All required exact-head GitHub Actions/build/security on deployed main.",
  "- [x] Only after all mandatory launch gates pass: label commercial **LIVE**.",
].join("\n");

describe("#1827 unified production and Federico launch guard", () => {
  it("guards the new canonical master, not the administratively merged #1414", () => {
    expect(MASTER_LAUNCH_ISSUE).toBe(1827);
    expect(workflow).toContain("github.event.issue.number == 1827");
    expect(runner).toContain("eventIssueNumber !== 1827");
    expect(runner).toContain("issues/1827");
  });

  it("resolves its real canonical guard module before any scheduled or issue-close run", () => {
    const imported = runner.match(/from\\s+["'](\\.\\.\\/lib\\/[^"']+\\.mjs)["']/)?.[1];
    expect(imported).toBe("../lib/issue-1414-closure-guard.mjs");
    expect(existsSync(resolve("scripts/ops", imported!))).toBe(true);
    expect(evaluateIssue1414Acceptance(headings + "\\n- [ ] Pending current production gate").accepted).toBe(false);
  });

  it("requires every outstanding production and open-PR checkbox", () => {
    const body = headings + "\n" + requiredProof + "\n- [ ] #1739 Risk Indices B2-cap repair";
    const evaluation = evaluateIssue1414Acceptance(body);
    expect(evaluation.accepted).toBe(false);
    expect(evaluation.uncheckedAcceptanceCount).toBe(1);
    expect(acceptanceScope(body)).toContain("#1739");
  });

  it("cannot be closed by simply deleting the old checklist or partner/payment evidence", () => {
    const noSections = evaluateIssue1414Acceptance(requiredProof);
    expect(noSections.accepted).toBe(false);
    expect(noSections.missingRequiredSections.length).toBeGreaterThan(0);

    const noMoney = evaluateIssue1414Acceptance(
      headings + "\n" + requiredProof.replace("[x] Owner", "[ ] Owner"),
    );
    expect(noMoney.accepted).toBe(false);
    expect(noMoney.missingRequiredLiveAcceptance.length).toBe(1);

    const noFederico = evaluateIssue1414Acceptance(
      headings + "\n" + requiredProof.replace("[x] **Federico", "[ ] **Federico"),
    );
    expect(noFederico.accepted).toBe(false);
    expect(noFederico.missingRequiredLiveAcceptance.length).toBe(1);
  });

  it("accepts only explicit full sections, all ticks and final proofs", () => {
    expect(evaluateIssue1414Acceptance(headings + "\n" + requiredProof).accepted).toBe(true);
    expect(evaluateIssue1414Acceptance(headings).missingRequiredLiveAcceptance.length).toBe(4);
  });

  it("keeps periodic and on-close fail-closed reopening for only #1827", () => {
    expect(workflow).toContain("types: [closed]");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain('cron: "*/15 * * * *"');
    expect(workflow).toContain("issues: write");
    expect(runner).toContain("evaluateIssue1414Acceptance(issue?.body ??");
    expect(runner).toContain('JSON.stringify({ state: "open" })');
    expect(runner).toContain("Federico");
    expect(runner).toContain("0.05 USDC");
  });
});
