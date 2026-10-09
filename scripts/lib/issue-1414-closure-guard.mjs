// Legacy filename retained for stable imports; authority migrated from #1414
// to the single combined Geomacro production + Federico tracker #1827.
export const MASTER_LAUNCH_ISSUE = 1827;
const REQUIRED_SECTIONS = [
  "# GEOMACRO — UNIFIED MASTER",
  "## Stage 0",
  "## P0", "## P1", "## P2", "## P3", "## P4",
  "## P5", "## P6", "## P7", "## P8",
  "## Migrated inventory: previously open ISSUES (7 of 7)",
  "## Migrated inventory: currently open PRs (12 of 12)",
];
const REQUIRED_FINAL_ACCEPTANCE = [
  /-\s*\[x\]\s+Owner mainnet ACK → first real 0\.05 USDC x402 paid purchase/i,
  /-\s*\[x\]\s+\*\*Federico receiver must return independently verifiable signed .*approve.* and ZERO unresolved findings\*\*/i,
  /-\s*\[x\]\s+All required exact-head GitHub Actions\/build\/security/i,
  /-\s*\[x\]\s+Only after all mandatory launch gates pass: label commercial \*\*LIVE\*\*/i,
];
export function acceptanceScope(body) {
  // No discarded legacy section: all P0-P8 AND all migrated PRs block closure
  // until each is merged, verifiably superseded or explicitly waived with proof.
  return String(body ?? "");
}
export function evaluateIssue1414Acceptance(body) {
  const scope = acceptanceScope(body);
  const unchecked = scope.match(/^\s*-\s*\[ \]\s+.+$/gm) ?? [];
  const missingRequiredLiveAcceptance = REQUIRED_FINAL_ACCEPTANCE
    .filter((pattern) => !pattern.test(scope))
    .map((pattern) => pattern.source);
  const missingRequiredSections = REQUIRED_SECTIONS.filter((section) => !scope.includes(section));
  return {
    accepted: unchecked.length === 0 &&
      missingRequiredLiveAcceptance.length === 0 &&
      missingRequiredSections.length === 0,
    uncheckedAcceptanceCount: unchecked.length,
    uncheckedAcceptance: unchecked.map((line) => line.trim()),
    missingRequiredLiveAcceptance,
    missingRequiredSections,
  };
}
