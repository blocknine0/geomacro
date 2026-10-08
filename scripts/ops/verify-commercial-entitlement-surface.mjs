import { readFileSync } from "node:fs";

/**
 * Semantic production-source acceptance. Customer-facing wording may change,
 * but price, access boundaries, payment authority and evidence time may not.
 * Prevents fragile CI failures when commercial wording/design is updated.
 */
const load = (path) => readFileSync(path, "utf8");
const guide = load("src/components/commercial-access-guide.tsx");
const pricing = load("src/routes/pricing.tsx");
const shell = load("src/components/site-shell.tsx");
const commerce = load("src/components/agent-commerce-status.tsx");
const intel = load("src/lib/use-intelligence.ts");
const card = load("src/components/intelligence/card.tsx");

function assert(ok, invariant) {
  if (!ok) throw new Error(`COMMERCIAL_WEBSITE_INVARIANT_FAILED:${invariant}`);
}

function containsAll(text, parts, label) {
  for (const part of parts) {
    assert(text.includes(part), `${label}:${part}`);
  }
}

// Public evidence timestamp must never be overwritten by the browser's clock.
containsAll(card, ["event.publishedAt ?? event.createdAt"], "evidence-card");
containsAll(intel, [
  "function latestEvidenceAt(rows: IntelEvent[]): number | null",
  "initialData ? latestEvidenceAt(initialData.all) : null",
  "setUpdatedAt(latestEvidenceAt(next.all));",
], "evidence-clock");
assert(!intel.includes("setUpdatedAt(Date.now())"), "browser-clock-not-evidence");

// Every eligible public page must share one three-tier access explanation.
containsAll(shell, [
  'import { CommercialAccessGuide } from "@/components/commercial-access-guide"',
  'pathname === "/pricing" ? null : <CommercialAccessGuide />',
], "sitewide-access");

// Core entitlements and customer operations are stable, independent of copy.
containsAll(guide, [
  'key: "free"',
  'key: "call"',
  'key: "monthly"',
  'to="/pricing"',
  'to="/intelligence"',
  "0.05 USDC",
  "mailto:contact@geomacro.live?subject=Geomacro%20monthly%20intelligence%20access",
  "useAgentCommerceStatus",
], "access-guide");
containsAll(pricing, [
  "Free Explorer",
  "0.05",
  "USDC / successful delivery",
  "20,000",
  "AgentCommerceStatus",
  "mailto:contact@geomacro.live?subject=Geomacro%20monthly%20intelligence%20access",
  "mailto:contact@geomacro.live?subject=Geomacro%20annual%20enterprise%20access",
], "pricing");

// Current production checkout authority is dynamic, not a marketing badge.
containsAll(commerce, [
  'fetch("/api/health"',
  'x402?.configured === true',
  'x402?.environment === "production"',
  'mode: production ? "production" : "prelaunch"',
], "x402-activation");
assert(!/to=["']\/(?:monthly-checkout|subscribe|subscription-checkout)["']/u.test(pricing), "no-fake-monthly-checkout");
assert(/(?:Coming Soon|not yet available|request a tailored plan)/iu.test(pricing), "monthly-not-misrepresented");
assert(/(?:failed|unavailable|unpaid).*(?:delive|request)/iu.test(pricing), "no-charge-failure-explained");

// Guard against a free structural API entitlement or unsupported guaranteed scope.
assert(!/free (?:unlimited|full) (?:commercial )?api/iu.test(guide + pricing), "no-free-commercial-api-promise");
assert(!/guaranteed (?:global|all-country|195-country) coverage/iu.test(guide + pricing), "no-coverage-overclaim");

process.stdout.write("PASS: stable commercial access, payment and evidence-time invariants validated.\n");
