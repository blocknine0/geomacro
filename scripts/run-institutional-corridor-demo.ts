#!/usr/bin/env bun

import {
  generateKeyPairSync,
} from "node:crypto";
import {
  performance,
} from "node:perf_hooks";

import {
  evaluateRiskGate,
} from "../src/lib/risk-gate-engine";
import {
  CORRIDOR_RISK_METHOD_VERSION,
  GRO_SCHEMA_VERSION,
  type GeomacroRiskObject,
} from "../src/lib/risk-object-contract";
import {
  signRiskObject,
} from "../src/lib/risk-object-signing.server";
import {
  verifyPublicRiskObjectArtifact,
} from "../src/lib/risk-object-verification.server";
import type {
  RiskGateRequest,
} from "../src/lib/risk-gate-contract";

const GENERATED_AT =
  "2026-09-09T17:00:00.000Z";
const EVALUATED_AT =
  new Date("2026-09-09T17:05:00.000Z");

function unsignedCorridorRiskObject():
  GeomacroRiskObject {
  return {
    schema_version: GRO_SCHEMA_VERSION,
    object_id:
      "gro_corridor_USA_CHN_institutional_demo",
    subject: {
      type: "corridor",
      id: "USA>CHN",
      name: "USA to CHN",
    },
    risk: {
      score: 68,
      label: "ELEVATED",
      previous_score: 54,
      delta: 14,
      direction: "escalating",
    },
    attribution: [
      {
        driver: "trade_policy",
        score_contribution: 26,
        delta_contribution: 8,
        event_count: 2,
        weight: 1,
      },
      {
        driver: "conflict",
        score_contribution: 22,
        delta_contribution: 4,
        event_count: 1,
        weight: 1,
      },
      {
        driver: "currency_fx",
        score_contribution: 20,
        delta_contribution: 2,
        event_count: 1,
        weight: 1,
      },
    ],
    confidence: 0.9,
    evidence: [
      {
        event_id: "demo-event-1",
        title:
          "Structured geopolitical disruption simulation",
        event_type: "simulation_fixture",
        severity: 78,
        confidence: 0.9,
        direction: "escalating",
        last_seen_at: GENERATED_AT,
        evidence_count: 3,
        independent_source_count: 2,
        evidence_refs: [
          "structured-demo-source-a",
          "structured-demo-source-b",
        ],
        source_families: [
          "simulation",
        ],
      },
    ],
    evidence_coverage: 0.8,
    evidence_summary: {
      event_count: 1,
      evidence_count: 3,
      independent_source_count: 2,
    },
    methodology_version:
      CORRIDOR_RISK_METHOD_VERSION,
    corridor_context: {
      origin_country_iso3: "USA",
      destination_country_iso3: "CHN",
      composition: "max_endpoint_score_v1",
      dominant_endpoint: "destination",
      source_risk_object_ids: [
        "gro_country_USA_demo",
        "gro_country_CHN_demo",
      ],
      source_calculation_hashes: [
        "1".repeat(64),
        "2".repeat(64),
      ],
    },
    generated_at: GENERATED_AT,
    expires_at:
      "2026-09-09T20:00:00.000Z",
    issuer: "Geomacro",
    commercial_eligibility: {
      status: "VERIFIED",
      reason_codes: [],
    },
    verification: {
      status: "VERIFIED",
      reason_codes: [],
      last_verified_at: GENERATED_AT,
    },
    integrity: {
      input_hash: "a".repeat(64),
      data_hash: "b".repeat(64),
      calculation_hash: "c".repeat(64),
      payload_hash: null,
      canonicalization: null,
      signature: null,
      signature_scheme: null,
      signing_key_id: null,
    },
    provenance: {
      structure_versions: [
        "simulation-fixture-v1",
      ],
      scoring_versions: [
        CORRIDOR_RISK_METHOD_VERSION,
      ],
      relevance_versions: [],
      country_versions: [],
      story_versions: [],
    },
  };
}

function policyRequest():
  RiskGateRequest {
  return {
    request_id:
      "institutional-corridor-demo-001",
    subject: {
      type: "corridor",
      id: "USA>CHN",
    },
    action_context: {
      action_type:
        "cross_border_treasury_transfer",
      amount: 500000,
      currency: "USD",
      destination: "CHN",
      metadata: {
        demo_mode:
          "SIMULATION_FIXTURE",
      },
    },
    policy: {
      policy_id:
        "institutional-treasury-demo",
      policy_version: "1.0.0",
      continue_max_score: 30,
      reduce_limit_max_score: 50,
      require_approval_max_score: 75,
      minimum_confidence_for_auto_continue: 0.8,
      require_commercial_verification_for_continue: true,
      max_positive_delta_for_auto_continue: 10,
    },
  };
}

export function runInstitutionalCorridorDemo() {
  const started = performance.now();
  const {
    privateKey,
    publicKey,
  } = generateKeyPairSync("ed25519");

  const keyId =
    "geomacro-demo-ephemeral-key";

  const signStarted = performance.now();
  const signed = signRiskObject(
    unsignedCorridorRiskObject(),
    {
      key_id: keyId,
      private_key_pkcs8_b64:
        privateKey.export({
          format: "der",
          type: "pkcs8",
        }).toString("base64"),
    },
  );
  const signEnded = performance.now();

  const verifyStarted = performance.now();
  const verification =
    verifyPublicRiskObjectArtifact(
      signed,
      {
        now: EVALUATED_AT,
        verification_keys: {
          [keyId]:
            publicKey.export({
              format: "der",
              type: "spki",
            }).toString("base64"),
        },
      },
    );
  const verifyEnded = performance.now();

  if (!verification.valid) {
    throw new Error(
      "Demo Risk Object failed cryptographic verification",
    );
  }

  const gateStarted = performance.now();
  const riskGate = evaluateRiskGate(
    policyRequest(),
    signed,
    EVALUATED_AT,
  );
  const gateEnded = performance.now();

  if (
    riskGate.recommended_action !==
      "REQUIRE_HUMAN_APPROVAL" ||
    riskGate.execution_authorized !== false
  ) {
    throw new Error(
      "Demo policy did not produce the expected non-authorizing review decision",
    );
  }

  const ended = performance.now();

  return {
    demo_version:
      "institutional-corridor-demo-v1.0.0",
    mode: "SIMULATION_FIXTURE",
    disclaimer:
      "This is a deterministic integration simulation, not a live production risk statement or production latency benchmark.",
    scenario: {
      corridor: "USA>CHN",
      action_type:
        "cross_border_treasury_transfer",
      amount: 500000,
      currency: "USD",
    },
    risk_object: {
      object_id: signed.object_id,
      schema_version:
        signed.schema_version,
      methodology_version:
        signed.methodology_version,
      payload_hash:
        signed.integrity.payload_hash,
      signing_key_id:
        signed.integrity.signing_key_id,
      verification_status:
        verification.status,
      cryptographic_valid:
        verification.cryptographic_valid,
    },
    risk_gate: {
      decision: riskGate.decision,
      recommended_action:
        riskGate.recommended_action,
      reason_codes:
        riskGate.reason_codes,
      counterfactual:
        riskGate.counterfactual,
      policy:
        riskGate.policy,
      execution_authorized:
        riskGate.execution_authorized,
    },
    local_processing_latency_ms: {
      sign:
        Number((signEnded - signStarted).toFixed(3)),
      verify:
        Number((verifyEnded - verifyStarted).toFixed(3)),
      risk_gate:
        Number((gateEnded - gateStarted).toFixed(3)),
      total:
        Number((ended - started).toFixed(3)),
    },
  };
}

if (import.meta.main) {
  console.log(
    JSON.stringify(
      runInstitutionalCorridorDemo(),
      null,
      2,
    ),
  );
}
