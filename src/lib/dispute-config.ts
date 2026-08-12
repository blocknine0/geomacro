/**
 * dispute-config.ts
 * ---------------------------------------------------------------
 * Single source of truth for every tunable dispute-system constant.
 * Same idea as AgentArenaProxy.sol on the contract side: everything else
 * (DisputeTribunal.tsx, CaseFile.tsx, useDisputeStatus.ts, dispute-bond.ts)
 * imports FROM here instead of hardcoding values inline. If AgentArenaV2
 * gets upgraded later (new bond formula, jury size, table rename), you
 * adjust this one file — no hunting through components.
 *
 * Keep this file's values in lockstep with the deployed AgentArenaV2
 * implementation. If you ever run `upgradeToAndCall` with different
 * constants, update this file in the same PR.
 * ---------------------------------------------------------------
 */

// ---- bond math — mirrors _clampBond in AgentArenaV2.sol ----
export const DISPUTE_BOND_BPS = 800n; // 8%
export const DISPUTE_BOND_FLOOR_WEI = 1n * 10n ** 18n; // $1
export const DISPUTE_BOND_CAP_WEI = 40n * 10n ** 18n; // $40

// ---- jury ----
export const JURY_SIZE = 5;
export const JURY_THRESHOLD = 4; // 4-of-5 supermajority to overturn OR uphold
export const DISPUTE_WINDOW_HOURS = 48; // matches DISPUTE_WINDOW_SECONDS pattern in sync-lifecycle.js

export const JUROR_ROLE_ORDER = [
  "fact_checker",
  "hawk_rearguer",
  "dove_rearguer",
  "evidence_skeptic",
  "domain_specialist",
] as const;

export type JurorRole = (typeof JUROR_ROLE_ORDER)[number];

export const JUROR_ROLE_LABEL: Record<JurorRole, string> = {
  fact_checker: "Fact-Checker",
  hawk_rearguer: "Hawk Re-arguer",
  dove_rearguer: "Dove Re-arguer",
  evidence_skeptic: "Evidence Skeptic",
  domain_specialist: "Domain Specialist",
};

// ---- Supabase table/column names ----
// Centralized so a future rename only touches this file, not every query.
export const TABLES = {
  marketDisputes: "market_disputes",
  juryVotes: "jury_votes",
} as const;

// ⚠️ See INTEGRATION.md — these four market_disputes columns exist but are
// currently never written after insert (resolve-disputes.js reads dispute
// state from the contract, not Supabase). Don't trust them for tally/
// resolved state until that's fixed. Kept here as named constants (not
// magic strings scattered in components) so the day they DO become
// reliable, there's one place to flip a `TRUST_MARKET_DISPUTES_TALLY` flag
// instead of re-auditing every component.
export const MARKET_DISPUTES_TALLY_COLUMNS_ARE_LIVE = false;

// ---- realtime channel naming ----
export const realtimeChannelName = (marketId: string) => `dispute:${marketId}`;

// ---- route ----
export const caseFileRoute = (marketId: string) => `/dispute/${marketId}`;
