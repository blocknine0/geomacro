const LEGACY_SECTION_MARKER = "# 14. Legacy launch issues";

const REQUIRED_LIVE_ACCEPTANCE_PATTERNS = [
  /- \[x\] First live real-money purchase succeeds at \*\*0\.05 USDC\*\*\./i,
  /- \[x\] Real paid response is received and verified end-to-end\./i,
  /- \[x\] real x402 live payment acceptance/i,
];

export function acceptanceScope(body) {
  const text = String(body ?? "");
  const markerIndex = text.indexOf(LEGACY_SECTION_MARKER);
  return markerIndex >= 0 ? text.slice(0, markerIndex) : text;
}

export function evaluateIssue1414Acceptance(body) {
  const scope = acceptanceScope(body);
  const unchecked = scope.match(/^\s*-\s*\[ \]\s+.+$/gm) ?? [];
  const missingRequiredLiveAcceptance = REQUIRED_LIVE_ACCEPTANCE_PATTERNS
    .filter((pattern) => !pattern.test(scope))
    .map((pattern) => pattern.source);

  return {
    accepted: unchecked.length === 0 && missingRequiredLiveAcceptance.length === 0,
    uncheckedAcceptanceCount: unchecked.length,
    uncheckedAcceptance: unchecked.map((line) => line.trim()),
    missingRequiredLiveAcceptance,
  };
}
