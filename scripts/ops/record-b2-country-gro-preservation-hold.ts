#!/usr/bin/env bun
import { readFileSync } from "node:fs";

const source = String(
  process.env.GLOBAL_CANONICAL_REFRESH_OUTPUT ??
    "artifacts/global-gro-continuity/canonical-risk-objects.json",
).trim();

let refresh: any;
try {
  refresh = JSON.parse(readFileSync(source, "utf8"));
} catch {
  throw new Error("B2_COUNTRY_GRO_HOLD_REFRESH_EVIDENCE_REQUIRED");
}

if (
  refresh?.schema_version !== "geomacro-global-canonical-refresh-v1" ||
  refresh?.denominator?.type !== "enabled_country_like_entities" ||
  Number(refresh?.denominator?.count ?? 0) < 195
) {
  throw new Error("B2_COUNTRY_GRO_HOLD_REFRESH_EVIDENCE_INVALID");
}

const ready = Number(refresh?.summary?.paid_ready_country_count ?? 0);
if (!Number.isInteger(ready) || ready >= 195) {
  throw new Error("B2_COUNTRY_GRO_HOLD_ONLY_FOR_INCOMPLETE_REFRESH");
}

const proof = {
  ok: false,
  schema: "geomacro.country-gro-preservation-hold.v1",
  generated_at: new Date().toISOString(),
  refresh_generated_at: refresh.generated_at ?? null,
  paid_ready_country_count: ready,
  required_country_count: 195,
  action: "FAIL_CLOSED_NO_B2_IO",
  previous_b2_package_mutated: false,
  previous_b2_package_reverified_this_run: false,
  b2_read_performed: false,
  b2_write_performed: false,
  freshness_advanced: false,
  d1_advanced: false,
  payment_performed: false,
  execution_authorized: false,
  reason:
    "new canonical country GRO floor was not met; preserve existing durable bytes without consuming B2 download quota and fail the launch gate",
};

process.stdout.write(JSON.stringify(proof, null, 2) + "\n");
