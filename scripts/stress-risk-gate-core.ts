import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { evaluateRiskGate } from "../src/lib/risk-gate-engine";
import type { RiskGateRequest } from "../src/lib/risk-gate-contract";
import {
  COUNTRY_RISK_METHOD_VERSION,
  GRO_SCHEMA_VERSION,
  riskLabel,
  type GeomacroRiskObject,
} from "../src/lib/risk-object-contract";

const argIndex = process.argv.indexOf("--iterations");
const iterations =
  argIndex >= 0 ? Number(process.argv[argIndex + 1]) : 50_000;

if (
  !Number.isInteger(iterations) ||
  iterations < 1_000 ||
  iterations > 500_000
) {
  throw new Error(
    "--iterations must be an integer between 1000 and 500000",
  );
}

const now = new Date("2026-09-10T03:30:00.000Z");

const policy = {
  policy_id: "stress-policy",
  policy_version: "1.0.0",
  continue_max_score: 35,
  reduce_limit_max_score: 55,
  require_approval_max_score: 75,
  minimum_confidence_for_auto_continue: 0.8,
  require_commercial_verification_for_continue: true,
  max_positive_delta_for_auto_continue: 10,
  hard_stop_driver_contributions: {
    sanctions: 20,
  },
} satisfies RiskGateRequest["policy"];

function request(requestId: string): RiskGateRequest {
  return {
    request_id: requestId,
    subject: {
      type: "country",
      id: "USA",
    },
    action_context: {
      action_type: "wallet_preflight",
      amount: 10_000,
      currency: "USD",
      destination: "counterparty",
      metadata: {},
    },
    policy,
  };
}

function gro(input: {
  score: number;
  confidence?: number;
  commercial?: "VERIFIED" | "UNVERIFIED";
  verification?:
    | "VERIFIED"
    | "STALE"
    | "INCOMPLETE"
    | "EXPIRED"
    | "UNVERIFIABLE";
  sanctionsContribution?: number;
}): GeomacroRiskObject {
  return {
    schema_version: GRO_SCHEMA_VERSION,
    object_id: `gro_country_USA_stress_${input.score}`,
    subject: {
      type: "country",
      id: "USA",
      name: "United States",
    },
    risk: {
      score: input.score,
      label: riskLabel(input.score),
      previous_score: input.score - 2,
      delta: 2,
      direction: "escalating",
    },
    attribution: [
      {
        driver: "macro_stress",
        score_contribution: 10,
        delta_contribution: 1,
        event_count: 3,
        weight: 0.4,
      },
      {
        driver: "sanctions",
        score_contribution: input.sanctionsContribution ?? 4,
        delta_contribution: 1,
        event_count: 1,
        weight: 0.1,
      },
    ],
    confidence: input.confidence ?? 0.9,
    evidence: [],
    evidence_coverage: null,
    evidence_summary: {
      event_count: 4,
      evidence_count: 7,
      independent_source_count: 4,
    },
    methodology_version: COUNTRY_RISK_METHOD_VERSION,
    generated_at: "2026-09-10T03:00:00.000Z",
    expires_at: "2026-09-10T06:00:00.000Z",
    issuer: "Geomacro",
    commercial_eligibility: {
      status: input.commercial ?? "VERIFIED",
      reason_codes: [],
    },
    verification: {
      status: input.verification ?? "VERIFIED",
      reason_codes: [],
      last_verified_at: "2026-09-10T03:01:00.000Z",
    },
    integrity: {
      input_hash: "a".repeat(64),
      data_hash: "b".repeat(64),
      calculation_hash: "c".repeat(64),
      payload_hash: "d".repeat(64),
      canonicalization: "geomacro-canonical-json-v1",
      signature: "stress-fixture-signature",
      signature_scheme: "Ed25519",
      signing_key_id: "stress-fixture-key",
    },
    provenance: {
      structure_versions: ["stress-structure"],
      scoring_versions: ["stress-scoring"],
      relevance_versions: ["stress-relevance"],
      country_versions: ["stress-country"],
      story_versions: ["stress-story"],
    },
  };
}

type Scenario = {
  name: string;
  object: GeomacroRiskObject;
  expectedDecision:
    | "CONTINUE"
    | "REDUCE_LIMIT"
    | "REQUIRE_APPROVAL"
    | "PAUSE";
};

const scenarios: Scenario[] = [
  {
    name: "verified-low-risk",
    object: gro({ score: 30 }),
    expectedDecision: "CONTINUE",
  },
  {
    name: "unverified-commercial-source",
    object: gro({ score: 30, commercial: "UNVERIFIED" }),
    expectedDecision: "REQUIRE_APPROVAL",
  },
  {
    name: "hard-stop-sanctions",
    object: gro({ score: 30, sanctionsContribution: 25 }),
    expectedDecision: "PAUSE",
  },
  {
    name: "unverifiable-object",
    object: gro({ score: 30, verification: "UNVERIFIABLE" }),
    expectedDecision: "PAUSE",
  },
];

const durations: number[] = [];
const counts = new Map<string, number>();
const started = performance.now();

for (let i = 0; i < iterations; i += 1) {
  const scenario = scenarios[i % scenarios.length];
  const opStart = performance.now();
  const response = evaluateRiskGate(
    request(`stress-${i}`),
    scenario.object,
    now,
  );
  durations.push(performance.now() - opStart);

  if (response.decision !== scenario.expectedDecision) {
    throw new Error(
      `${scenario.name}: expected ${scenario.expectedDecision}, got ${response.decision}`,
    );
  }

  if (response.execution_authorized !== false) {
    throw new Error(
      `${scenario.name}: execution_authorized boundary changed`,
    );
  }

  counts.set(
    response.decision,
    (counts.get(response.decision) ?? 0) + 1,
  );
}

const durationMs = performance.now() - started;
const sorted = [...durations].sort((a, b) => a - b);

function percentile(fraction: number) {
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * fraction) - 1),
  );
  return sorted[index];
}

const report = {
  generated_at: new Date().toISOString(),
  scope:
    "in-process Risk Gate decision engine only; no network, auth DB, audit DB, idempotency DB, signing service or external dependency",
  iterations,
  scenarios: scenarios.map((scenario) => ({
    name: scenario.name,
    expected_decision: scenario.expectedDecision,
  })),
  duration_ms: Number(durationMs.toFixed(3)),
  operations_per_second: Number(
    ((iterations / durationMs) * 1000).toFixed(2),
  ),
  p50_ms: Number(percentile(0.5).toFixed(6)),
  p95_ms: Number(percentile(0.95).toFixed(6)),
  p99_ms: Number(percentile(0.99).toFixed(6)),
  decisions: Object.fromEntries(counts),
  execution_authorized_false: true,
};

mkdirSync("artifacts", { recursive: true });
writeFileSync(
  "artifacts/risk-gate-core-stress.json",
  `${JSON.stringify(report, null, 2)}\n`,
);

console.log(JSON.stringify(report, null, 2));
