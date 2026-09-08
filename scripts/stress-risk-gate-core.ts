import {
  mkdirSync,
  writeFileSync,
} from "node:fs";
import {
  performance,
} from "node:perf_hooks";

import {
  parseExternalRiskGateBody,
  RiskGateApiError,
} from "../src/lib/risk-gate-api.server";

import {
  evaluateRiskGate,
} from "../src/lib/risk-gate-engine";

import {
  COUNTRY_RISK_METHOD_VERSION,
  GRO_SCHEMA_VERSION,
  type GeomacroRiskObject,
} from "../src/lib/risk-object-contract";

const argIndex =
  process.argv.indexOf(
    "--iterations",
  );

const ITERATIONS =
  argIndex >= 0
    ? Number(
        process.argv[
          argIndex + 1
        ],
      )
    : 30000;

if (
  !Number.isInteger(
    ITERATIONS,
  ) ||
  ITERATIONS < 1000 ||
  ITERATIONS > 500000
) {
  throw new Error(
    "--iterations must be an integer between 1000 and 500000",
  );
}

const NOW =
  new Date(
    "2026-09-08T12:00:00.000Z",
  );

const policy = {
  policy_id:
    "stress-policy",
  policy_version:
    "1.0.0",
  continue_max_score:
    35,
  reduce_limit_max_score:
    55,
  require_approval_max_score:
    75,
  minimum_confidence_for_auto_continue:
    0.8,
  require_commercial_verification_for_continue:
    true,
  max_positive_delta_for_auto_continue:
    10,
  hard_stop_driver_contributions: {
    sanctions: 20,
  },
};

const countryBody = {
  request_id:
    "stress-country",
  subject: {
    type: "country",
    country_iso3: "usa",
  },
  evaluated_at:
    NOW.toISOString(),
  action_context: {
    action_type:
      "wallet_preflight",
    amount: 10000,
    currency: "USDC",
    destination:
      "counterparty",
    metadata: {
      corridor:
        "test-only",
    },
  },
  policy,
};

const corridorBody = {
  request_id:
    "stress-corridor",
  subject: {
    type: "corridor",
    origin_country_iso3:
      "usa",
    destination_country_iso3:
      "chn",
  },
  evaluated_at:
    NOW.toISOString(),
  action_context: {
    action_type:
      "cross_border_payment",
    amount: 25000,
    currency: "USDC",
  },
  policy,
};

const gro:
  GeomacroRiskObject = {
  schema_version:
    GRO_SCHEMA_VERSION,
  object_id:
    "gro_country_USA_stress",
  subject: {
    type: "country",
    id: "USA",
    name: "United States",
  },
  risk: {
    score: 42,
    label: "WATCH",
    previous_score: 39,
    delta: 3,
    direction: "escalating",
  },
  attribution: [
    {
      driver: "macro_stress",
      score_contribution: 14,
      delta_contribution: 2,
      event_count: 4,
      weight: 0.33,
    },
    {
      driver: "sanctions",
      score_contribution: 7,
      delta_contribution: 1,
      event_count: 2,
      weight: 0.2,
    },
  ],
  confidence: 0.91,
  evidence: [],
  evidence_coverage: null,
  evidence_summary: {
    event_count: 6,
    evidence_count: 9,
    independent_source_count: 5,
  },
  methodology_version:
    COUNTRY_RISK_METHOD_VERSION,
  generated_at:
    "2026-09-08T11:30:00.000Z",
  expires_at:
    "2026-09-08T14:30:00.000Z",
  issuer: "Geomacro",
  commercial_eligibility: {
    status: "VERIFIED",
    reason_codes: [],
  },
  verification: {
    status: "VERIFIED",
    reason_codes: [],
    last_verified_at:
      "2026-09-08T11:31:00.000Z",
  },
  integrity: {
    input_hash: "a".repeat(64),
    data_hash: "b".repeat(64),
    calculation_hash:
      "c".repeat(64),
    payload_hash: "d".repeat(64),
    canonicalization:
      "geomacro-canonical-json-v1",
    signature:
      "test-signature",
    signature_scheme:
      "Ed25519",
    signing_key_id:
      "stress-key",
  },
  provenance: {
    structure_versions: [],
    scoring_versions: [],
    relevance_versions: [],
    country_versions: [],
    story_versions: [],
  },
};

const request = {
  request_id:
    "stress-engine",
  subject: {
    type: "country" as const,
    id: "USA",
  },
  action_context: {
    action_type:
      "wallet_preflight",
  },
  policy,
};

type BenchResult = {
  name: string;
  iterations: number;
  duration_ms: number;
  operations_per_second: number;
  p50_ms_per_operation: number;
  p95_ms_per_operation: number;
};

function percentile(
  values: number[],
  fraction: number,
) {
  const sorted =
    [...values].sort(
      (a, b) => a - b,
    );

  const index =
    Math.min(
      sorted.length - 1,
      Math.max(
        0,
        Math.ceil(
          sorted.length *
            fraction,
        ) - 1,
      ),
    );

  return sorted[index] ?? 0;
}

function benchmark(
  name: string,
  iterations: number,
  operation: () => void,
): BenchResult {
  const batchSize =
    Math.min(
      250,
      iterations,
    );

  const perOperationSamples:
    number[] = [];

  const started =
    performance.now();

  for (
    let offset = 0;
    offset < iterations;
    offset += batchSize
  ) {
    const count =
      Math.min(
        batchSize,
        iterations - offset,
      );

    const batchStarted =
      performance.now();

    for (
      let i = 0;
      i < count;
      i += 1
    ) {
      operation();
    }

    const batchDuration =
      performance.now() -
      batchStarted;

    perOperationSamples.push(
      batchDuration /
        count,
    );
  }

  const duration =
    performance.now() -
    started;

  return {
    name,
    iterations,
    duration_ms:
      Number(
        duration.toFixed(3),
      ),
    operations_per_second:
      Number(
        (
          iterations /
          (duration / 1000)
        ).toFixed(2),
      ),
    p50_ms_per_operation:
      Number(
        percentile(
          perOperationSamples,
          0.5,
        ).toFixed(6),
      ),
    p95_ms_per_operation:
      Number(
        percentile(
          perOperationSamples,
          0.95,
        ).toFixed(6),
      ),
  };
}

const heapBefore =
  process.memoryUsage()
    .heapUsed;

let countryChecks = 0;
let corridorChecks = 0;
let engineChecks = 0;
let rejectedChecks = 0;

const results = [
  benchmark(
    "country_request_parse",
    ITERATIONS,
    () => {
      const parsed =
        parseExternalRiskGateBody(
          countryBody,
          NOW,
        );

      if (
        parsed.subject_type !==
          "country" ||
        parsed.subject_id !==
          "USA"
      ) {
        throw new Error(
          "Country parser correctness failure",
        );
      }

      countryChecks += 1;
    },
  ),

  benchmark(
    "corridor_request_parse",
    ITERATIONS,
    () => {
      const parsed =
        parseExternalRiskGateBody(
          corridorBody,
          NOW,
        );

      if (
        parsed.subject_type !==
          "corridor" ||
        parsed.subject_id !==
          "USA>CHN"
      ) {
        throw new Error(
          "Corridor parser correctness failure",
        );
      }

      corridorChecks += 1;
    },
  ),

  benchmark(
    "policy_engine_evaluation",
    ITERATIONS,
    () => {
      const response =
        evaluateRiskGate(
          request,
          gro,
          NOW,
        );

      if (
        response.decision !==
          "REDUCE_LIMIT" ||
        response.execution_authorized !==
          false
      ) {
        throw new Error(
          "Risk Gate engine boundary failure",
        );
      }

      engineChecks += 1;
    },
  ),

  benchmark(
    "historical_time_rejection",
    Math.max(
      1000,
      Math.floor(
        ITERATIONS / 5,
      ),
    ),
    () => {
      try {
        parseExternalRiskGateBody(
          {
            ...countryBody,
            evaluated_at:
              "2026-09-01T00:00:00.000Z",
          },
          NOW,
        );
      } catch (error) {
        if (
          error instanceof
            RiskGateApiError &&
          error.code ===
            "EVALUATION_TIME_OUT_OF_RANGE"
        ) {
          rejectedChecks += 1;
          return;
        }

        throw error;
      }

      throw new Error(
        "Historical live-preflight evaluation unexpectedly accepted",
      );
    },
  ),
];

if (
  countryChecks !==
    ITERATIONS ||
  corridorChecks !==
    ITERATIONS ||
  engineChecks !==
    ITERATIONS ||
  rejectedChecks !==
    Math.max(
      1000,
      Math.floor(
        ITERATIONS / 5,
      ),
    )
) {
  throw new Error(
    "Risk Gate stress correctness counters did not reconcile",
  );
}

const heapAfter =
  process.memoryUsage()
    .heapUsed;

const report = {
  suite:
    "risk-gate-core-resilience-v1",
  generated_at:
    new Date()
      .toISOString(),
  scope: [
    "external country request parser",
    "external corridor request parser",
    "customer policy evaluation engine",
    "historical live-preflight rejection boundary",
  ],
  exclusions: [
    "Supabase/database latency",
    "network transport",
    "authentication backend",
    "database-backed rate limiter",
    "production/staging concurrent HTTP load",
  ],
  iterations:
    ITERATIONS,
  correctness: {
    country_checks:
      countryChecks,
    corridor_checks:
      corridorChecks,
    engine_checks:
      engineChecks,
    rejected_historical_checks:
      rejectedChecks,
    execution_authorized_remained_false:
      true,
  },
  memory: {
    heap_before_bytes:
      heapBefore,
    heap_after_bytes:
      heapAfter,
    heap_delta_bytes:
      heapAfter -
      heapBefore,
  },
  benchmarks:
    results,
  pass: true,
};

mkdirSync(
  "artifacts",
  {
    recursive: true,
  },
);

writeFileSync(
  "artifacts/risk-gate-core-resilience.json",
  `${JSON.stringify(
    report,
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(
  JSON.stringify(
    report,
    null,
    2,
  ),
);
