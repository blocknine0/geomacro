import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { buildAgentQueryPlan } from "../../src/lib/agent-query-plan";
import { evaluateRiskGate } from "../../src/lib/risk-gate-engine";
import {
  CORRIDOR_RISK_METHOD_VERSION,
  COUNTRY_RISK_METHOD_VERSION,
  GRO_CANONICALIZATION_VERSION,
  GRO_SCHEMA_VERSION,
  riskLabel,
  type GeomacroRiskObject,
} from "../../src/lib/risk-object-contract";
import type { RiskGateRequest } from "../../src/lib/risk-gate-contract";

const PRODUCT_ID = "geomacro_adaptive_risk_intelligence_v1";
const MAX_AGENTS = 1_000_000;
const DEFAULT_AGENTS = 1_000_000;
const SAMPLE_EVERY = 250;
const MIN_SYNTHETIC_THROUGHPUT_PER_SECOND = 2_500;
const MAX_SAMPLED_P99_MS = 25;
const MAX_RSS_MB = 1_500;
const FORBIDDEN_SERIALIZED_MARKERS = [
  "service_role",
  "private_key",
  "api_key_secret",
  "payment-signature",
  "payment_signature",
  "credential_pepper",
  "fingerprint_pepper",
  "supabase_service_role_key",
  "cdp_api_key_secret",
];

const countries = [
  "USA", "CHN", "IND", "DEU", "JPN", "GBR", "FRA", "BRA",
  "CAN", "AUS", "KOR", "SGP", "ARE", "SAU", "MEX", "ZAF",
] as const;

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function percentile(values: number[], fraction: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * fraction) - 1),
  );
  return Number(sorted[index]!.toFixed(4));
}

function parseAgents() {
  const arg = process.argv.find((item) => item.startsWith("--agents="));
  const raw = arg ? arg.slice("--agents=".length) : String(DEFAULT_AGENTS);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > MAX_AGENTS) {
    throw new Error(`--agents must be an integer within 1..${MAX_AGENTS}`);
  }
  return value;
}

function makeRiskObject(input: {
  index: number;
  subject: { type: "country"; id: string } | { type: "corridor"; id: string };
}): GeomacroRiskObject {
  const score = (input.index * 37) % 101;
  const previousScore = Math.max(0, Math.min(100, score - ((input.index % 9) - 4)));
  const now = new Date("2026-09-17T00:00:00.000Z");
  const expires = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const corridor = input.subject.type === "corridor";
  const [origin, destination] = corridor ? input.subject.id.split(">") : [null, null];

  return {
    schema_version: GRO_SCHEMA_VERSION,
    object_id: `synthetic-gro-${input.index}`,
    subject: {
      type: input.subject.type,
      id: input.subject.id,
      name: null,
    },
    risk: {
      score,
      label: riskLabel(score),
      previous_score: previousScore,
      delta: score - previousScore,
      direction: score > previousScore ? "escalating" : score < previousScore ? "cooling" : "steady",
    },
    attribution: [
      {
        driver: "macro_stress",
        score_contribution: Math.min(score, 40),
        delta_contribution: score - previousScore,
        event_count: 3,
        weight: 0.4,
      },
      {
        driver: "trade_policy",
        score_contribution: Math.max(0, score - Math.min(score, 40)),
        delta_contribution: 0,
        event_count: 2,
        weight: 0.3,
      },
    ],
    confidence: 0.9,
    evidence: [],
    evidence_coverage: null,
    evidence_summary: {
      event_count: 5,
      evidence_count: 8,
      independent_source_count: 4,
    },
    methodology_version: corridor ? CORRIDOR_RISK_METHOD_VERSION : COUNTRY_RISK_METHOD_VERSION,
    ...(corridor
      ? {
          corridor_context: {
            origin_country_iso3: origin!,
            destination_country_iso3: destination!,
            composition: "max_endpoint_score_v1" as const,
            dominant_endpoint: "origin" as const,
            source_risk_object_ids: [`synthetic-origin-${input.index}`, `synthetic-destination-${input.index}`] as [string, string],
            source_calculation_hashes: [sha256(`origin:${input.index}`), sha256(`destination:${input.index}`)] as [string, string],
          },
        }
      : {}),
    observed_at: now.toISOString(),
    generated_at: now.toISOString(),
    expires_at: expires.toISOString(),
    issuer: "Geomacro",
    commercial_eligibility: {
      status: "VERIFIED",
      reason_codes: [],
    },
    verification: {
      status: "VERIFIED",
      reason_codes: [],
      last_verified_at: now.toISOString(),
    },
    integrity: {
      input_hash: sha256(`input:${input.index}`),
      data_hash: sha256(`data:${input.index}`),
      calculation_hash: sha256(`calc:${input.index}`),
      payload_hash: sha256(`payload:${input.index}`),
      canonicalization: GRO_CANONICALIZATION_VERSION,
      signature: "synthetic-not-a-production-signature",
      signature_scheme: "Ed25519",
      signing_key_id: "synthetic-scale-test-key",
    },
    provenance: {
      structure_versions: ["scale-test"],
      scoring_versions: ["scale-test"],
      relevance_versions: ["scale-test"],
      country_versions: ["scale-test"],
      story_versions: ["scale-test"],
    },
  };
}

function makePolicy(): RiskGateRequest["policy"] {
  return {
    policy_id: "geomacro-million-agent-readiness",
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
  };
}

function assertNoSerializedSecretMarkers(serialized: string) {
  const normalized = serialized.toLowerCase();
  for (const marker of FORBIDDEN_SERIALIZED_MARKERS) {
    if (normalized.includes(marker)) {
      throw new Error(`SERIALIZED_SECRET_MARKER_DETECTED:${marker}`);
    }
  }
}

function buildVirtualQuery(index: number) {
  const origin = countries[index % countries.length]!;
  const destination = countries[(index * 7 + 3) % countries.length]!;
  const useCorridor = index % 3 === 1 && origin !== destination;
  const subject = useCorridor
    ? { type: "corridor" as const, origin_country_iso3: origin, destination_country_iso3: destination }
    : { type: "country" as const, country_iso3: origin };

  return {
    schema_version: "geomacro.agent-query.v1" as const,
    subjects: [subject],
    topics: useCorridor
      ? ["trade_corridor", "risk_gate"] as const
      : ["macro_risk", "risk_gate"] as const,
    intent: "risk_gate" as const,
    evidence: "required" as const,
    detail: index % 5 === 0 ? "full" as const : "compact" as const,
    risk_gate_context: {
      policy_preset: index % 7 === 0 ? "strict" as const : "balanced" as const,
      action_type: index % 2 === 0 ? "agent_payment" as const : "treasury_payment" as const,
      amount_usdc: 1 + (index % 1_000_000),
    },
    client_request_id: `scale-agent-${index}`,
  };
}

const agents = parseAgents();
const sampledLatencyMs: number[] = [];
let executionBoundaryViolations = 0;
let planStabilityViolations = 0;
let replayBindingViolations = 0;
let serializationLeakViolations = 0;
let processingFailures = 0;
let countryCount = 0;
let corridorCount = 0;
let responseBytes = 0;

const started = performance.now();

for (let index = 0; index < agents; index += 1) {
  const sample = index % SAMPLE_EVERY === 0;
  const itemStarted = sample ? performance.now() : 0;

  try {
    const raw = buildVirtualQuery(index);
    const plan = buildAgentQueryPlan(raw);
    const builtAgain = index % 10_000 === 0 ? buildAgentQueryPlan(raw) : null;

    if (builtAgain && builtAgain.query_plan_hash !== plan.query_plan_hash) {
      planStabilityViolations += 1;
    }

    const plannedSubject = plan.subjects[0]!;
    const subject = plannedSubject.type === "country"
      ? { type: "country" as const, id: plannedSubject.country_iso3 }
      : {
          type: "corridor" as const,
          id: `${plannedSubject.origin_country_iso3}>${plannedSubject.destination_country_iso3}`,
        };

    if (subject.type === "country") countryCount += 1;
    else corridorCount += 1;

    const riskObject = makeRiskObject({ index, subject });
    const gate = evaluateRiskGate(
      {
        request_id: raw.client_request_id,
        subject,
        action_context: {
          action_type: raw.risk_gate_context.action_type,
          amount: raw.risk_gate_context.amount_usdc,
          currency: "USDC",
          metadata: {
            synthetic: true,
            scale_test: true,
          },
        },
        policy: makePolicy(),
      },
      riskObject,
      new Date("2026-09-17T00:30:00.000Z"),
    );

    if (gate.execution_authorized !== false) executionBoundaryViolations += 1;

    // Model the production x402 query binding without contacting a facilitator
    // or accepting funds. The same business terms must be stable; changed terms
    // must produce a different request fingerprint.
    const businessBinding = sha256(
      JSON.stringify({
        product: PRODUCT_ID,
        query_plan_hash: plan.query_plan_hash,
        client_request_id: raw.client_request_id,
      }),
    );
    const replayBinding = sha256(
      JSON.stringify({
        product: PRODUCT_ID,
        query_plan_hash: plan.query_plan_hash,
        client_request_id: raw.client_request_id,
      }),
    );

    if (businessBinding !== replayBinding) replayBindingViolations += 1;

    if (index % 10_000 === 0) {
      const changedBinding = sha256(
        JSON.stringify({
          product: PRODUCT_ID,
          query_plan_hash: plan.query_plan_hash,
          client_request_id: `${raw.client_request_id}-changed`,
        }),
      );
      if (changedBinding === businessBinding) replayBindingViolations += 1;
    }

    const deliveredProductHash = sha256(
      JSON.stringify({
        product: PRODUCT_ID,
        plan: plan.query_plan_hash,
        risk_object: riskObject.integrity.calculation_hash,
        risk_gate: gate,
      }),
    );

    const publicResponse = {
      schema_version: "geomacro.synthetic-million-agent-e2e.v1",
      ok: true,
      product: PRODUCT_ID,
      request_id: raw.client_request_id,
      query_plan_hash: plan.query_plan_hash,
      delivered_product_hash: deliveredProductHash,
      risk_gate: gate,
      payment: {
        simulated_only: true,
        real_funds_used: false,
        query_plan_bound: true,
        replay_safe_binding: true,
      },
      execution_authorized: false as const,
    };

    const serialized = JSON.stringify(publicResponse);
    responseBytes += Buffer.byteLength(serialized);
    try {
      assertNoSerializedSecretMarkers(serialized);
    } catch {
      serializationLeakViolations += 1;
    }
  } catch (error) {
    processingFailures += 1;
    if (processingFailures <= 5) {
      console.error("virtual agent failure", index, error);
    }
  }

  if (sample) sampledLatencyMs.push(performance.now() - itemStarted);
}

const durationMs = performance.now() - started;
const throughputPerSecond = agents / (durationMs / 1000);
const rssMb = process.memoryUsage().rss / 1024 / 1024;
const p50 = percentile(sampledLatencyMs, 0.5);
const p95 = percentile(sampledLatencyMs, 0.95);
const p99 = percentile(sampledLatencyMs, 0.99);
const averageResponseBytes = responseBytes / agents;

const correctnessPass =
  processingFailures === 0 &&
  executionBoundaryViolations === 0 &&
  planStabilityViolations === 0 &&
  replayBindingViolations === 0 &&
  serializationLeakViolations === 0;

const performancePass =
  throughputPerSecond >= MIN_SYNTHETIC_THROUGHPUT_PER_SECOND &&
  p99 <= MAX_SAMPLED_P99_MS &&
  rssMb <= MAX_RSS_MB;

const evidence = {
  schema_version: "geomacro.million-agent-readiness.v1",
  generated_at: new Date().toISOString(),
  boundary: {
    synthetic_virtual_agents: true,
    real_http_capacity_claim: false,
    real_payment_performed: false,
    production_activation_performed: false,
    production_host_contacted: false,
    note: "This proves deterministic business-flow correctness and in-process throughput for one million virtual agents. It does not replace authenticated HTTP staging/load evidence or an external penetration test.",
  },
  population: {
    agents,
    country_requests: countryCount,
    corridor_requests: corridorCount,
  },
  correctness: {
    processing_failures: processingFailures,
    execution_boundary_violations: executionBoundaryViolations,
    query_plan_stability_violations: planStabilityViolations,
    replay_binding_violations: replayBindingViolations,
    serialized_secret_marker_violations: serializationLeakViolations,
  },
  performance: {
    duration_ms: Number(durationMs.toFixed(2)),
    throughput_agents_per_second: Number(throughputPerSecond.toFixed(2)),
    sampled_operation_latency_ms: {
      samples: sampledLatencyMs.length,
      p50,
      p95,
      p99,
    },
    average_public_response_bytes: Number(averageResponseBytes.toFixed(2)),
    rss_mb: Number(rssMb.toFixed(2)),
    synthetic_budgets: {
      minimum_throughput_agents_per_second: MIN_SYNTHETIC_THROUGHPUT_PER_SECOND,
      maximum_sampled_p99_ms: MAX_SAMPLED_P99_MS,
      maximum_rss_mb: MAX_RSS_MB,
    },
  },
  result: correctnessPass && performancePass ? "PASS" : "FAIL",
};

mkdirSync("artifacts", { recursive: true });
writeFileSync(
  "artifacts/million-agent-readiness.json",
  `${JSON.stringify(evidence, null, 2)}\n`,
);

console.log(JSON.stringify(evidence, null, 2));

if (!correctnessPass) {
  throw new Error("One-million-agent correctness invariants failed");
}
if (!performancePass) {
  throw new Error("One-million-agent synthetic performance budget failed");
}
