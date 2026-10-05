import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  acceptanceScope,
  evaluateIssue1414Acceptance,
} from "../../scripts/lib/issue-1414-closure-guard.mjs";

const workflow = readFileSync(".github/workflows/issue-1414-closure-guard.yml", "utf8");
const runner = readFileSync("scripts/ops/enforce-issue-1414-closure.mjs", "utf8");

describe("#1414 closure guard", () => {
  it("ignores non-blocking legacy checkboxes in section 14", () => {
    const body = `# 10. x402 pay-per-call readiness\n- [x] First live real-money purchase succeeds at **0.05 USDC**.\n- [x] Real paid response is received and verified end-to-end.\n# 12. CI / launch gates\n- [x] real x402 live payment acceptance\n# 14. Legacy launch issues absorbed as partial workstreams\n- [ ] #976 legacy scope may remain open\n`;
    expect(acceptanceScope(body)).not.toContain("#976");
    expect(evaluateIssue1414Acceptance(body).accepted).toBe(true);
  });

  it("rejects closure while any Sections 1–13 acceptance checkbox remains open", () => {
    const body = `# 8. Product alignment\n- [ ] Ask Geomacro uses canonical B2/current evidence first.\n# 10. x402 pay-per-call readiness\n- [x] First live real-money purchase succeeds at **0.05 USDC**.\n- [x] Real paid response is received and verified end-to-end.\n# 12. CI / launch gates\n- [x] real x402 live payment acceptance\n# 14. Legacy launch issues absorbed as partial workstreams\n- [ ] #976 legacy scope\n`;
    const result = evaluateIssue1414Acceptance(body);
    expect(result.accepted).toBe(false);
    expect(result.uncheckedAcceptanceCount).toBe(1);
  });

  it("rejects closure if live-money acceptance markers are absent even when no unchecked boxes remain", () => {
    const body = `# 12. CI / launch gates\n- [x] Product CI / build\n# 14. Legacy launch issues absorbed as partial workstreams\n- [ ] #976 legacy scope\n`;
    const result = evaluateIssue1414Acceptance(body);
    expect(result.accepted).toBe(false);
    expect(result.missingRequiredLiveAcceptance.length).toBe(3);
  });

  it("supports immediate issue-close enforcement plus periodic and manual self-heal", () => {
    expect(workflow).toContain("types: [closed]");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain('cron: "*/15 * * * *"');
    expect(workflow).toContain("issues: write");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("github.event_name != 'issues' || github.event.issue.number == 1414");
    expect(workflow).toContain("node scripts/ops/enforce-issue-1414-closure.mjs");
  });

  it("reads the canonical issue API before deciding whether a reopen is required", () => {
    expect(runner).toContain('`${apiBase}/repos/${repository}/issues/1414`');
    expect(runner).toContain("const issueResponse = await fetch(issueUrl, { headers })");
    expect(runner).toContain("const state = String(issue?.state ?? \"\").toLowerCase()");
    expect(runner).toContain("evaluateIssue1414Acceptance(issue?.body ?? \"\")");
    expect(runner).toContain('reason: "master_tracker_already_open"');
  });

  it("reopens through the issue API and records why", () => {
    expect(runner).toContain('JSON.stringify({ state: "open" })');
    expect(runner).toContain('`${issueUrl}/comments`');
    expect(runner).toContain("Sections 1–13");
    expect(runner).toContain("0.05 USDC");
    expect(runner).toContain("runs periodically");
  });
});
