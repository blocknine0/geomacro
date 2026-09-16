import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { enforceCentralRequestSecurity } from "../../src/lib/central-security.server";

const DEFAULT_CASES = 250_000;
const MAX_CASES = 1_000_000;
const DEFAULT_SPRAY_AGENTS = 1_000_000;
const SHARDS = 16;
const PAYMENT_GLOBAL_LIMIT = 900;
const PAYMENT_PER_CLIENT_LIMIT = 45;

function parseIntegerArg(name: string, fallback: number, max: number) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  const value = Number(arg ? arg.slice(prefix.length) : fallback);
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${name} must be within 1..${max}`);
  }
  return value;
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const cases = parseIntegerArg("cases", DEFAULT_CASES, MAX_CASES);
const sprayAgents = parseIntegerArg("spray-agents", DEFAULT_SPRAY_AGENTS, MAX_CASES);

// A dedicated test-only value. It is never written to evidence.
process.env.GEOMACRO_SECURITY_FINGERPRINT_PEPPER = "s".repeat(64);
process.env.GEOMACRO_API_CREDENTIAL_PEPPER = "a".repeat(64);

const paths = [
  "/api/x402/intelligence",
  "/api/x402/risk",
  "/api/risk-gate",
  "/api/commercial/structural",
  "/api/internal/rebuild",
  "/api/demo/feedback",
] as const;

const expectedCodes = new Set([
  "CENTRAL_SECURITY_METHOD_BLOCKED",
  "CENTRAL_SECURITY_HEADERS_TOO_LARGE",
  "CENTRAL_SECURITY_BODY_TOO_LARGE",
  "CENTRAL_SECURITY_INVALID_CONTENT_LENGTH",
  "CENTRAL_SECURITY_AMBIGUOUS_FRAMING",
]);

let envelopeFailures = 0;
const codeCounts: Record<string, number> = {};
const statusCounts: Record<string, number> = {};
const started = performance.now();

for (let index = 0; index < cases; index += 1) {
  const path = paths[index % paths.length]!;
  const mode = index % 7;
  let method = "POST";
  const headers = new Headers();

  if (mode === 0) {
    method = "TRACE";
  } else if (mode === 1) {
    method = "CONNECT";
  } else if (mode === 2) {
    headers.set("authorization", `Bearer ${"x".repeat(5000)}`);
  } else if (mode === 3) {
    headers.set("cookie", `session=${"y".repeat(17 * 1024)}`);
  } else if (mode === 4) {
    headers.set("content-length", String(1024 * 1024));
  } else if (mode === 5) {
    headers.set("content-length", "not-a-number");
  } else {
    headers.set("content-length", "32");
    headers.set("transfer-encoding", "chunked");
  }

  const decision = await enforceCentralRequestSecurity({
    pathname: path,
    method,
    headers,
  });

  codeCounts[decision.code] = (codeCounts[decision.code] ?? 0) + 1;
  statusCounts[String(decision.status)] = (statusCounts[String(decision.status)] ?? 0) + 1;

  if (decision.allowed || !expectedCodes.has(decision.code)) {
    envelopeFailures += 1;
    if (envelopeFailures <= 5) {
      console.error("unexpected adversarial envelope decision", { index, path, mode, decision });
    }
  }
}

const envelopeDurationMs = performance.now() - started;

// Model a million-identity credential/payment spray against the exact v2 shard
// policy. This does not attack a network target. It verifies that rotating client
// identities cannot turn the sharded global budget into an unbounded bypass.
const shardLimit = Math.ceil(PAYMENT_GLOBAL_LIMIT / SHARDS);
const shardCounts = new Array<number>(SHARDS).fill(0);
let sprayAllowed = 0;
let sprayBlocked = 0;
let perClientViolations = 0;

const sprayStarted = performance.now();
for (let index = 0; index < sprayAgents; index += 1) {
  const digest = sha256(`synthetic-credential-spray-agent:${index}`);
  const shard = Number.parseInt(digest[0]!, 16);
  shardCounts[shard] += 1;
  const clientRequestCount = 1;
  const clientAllowed = clientRequestCount <= PAYMENT_PER_CLIENT_LIMIT;
  const globalShardAllowed = shardCounts[shard] <= shardLimit;
  if (!clientAllowed) perClientViolations += 1;
  if (clientAllowed && globalShardAllowed) sprayAllowed += 1;
  else sprayBlocked += 1;
}
const sprayDurationMs = performance.now() - sprayStarted;

const maximumAllowedByDesign = SHARDS * shardLimit;
const aggregateOvershootBound = maximumAllowedByDesign - PAYMENT_GLOBAL_LIMIT;
const sprayBoundPass =
  sprayAllowed <= maximumAllowedByDesign &&
  aggregateOvershootBound <= SHARDS - 1 &&
  sprayBlocked === sprayAgents - sprayAllowed &&
  perClientViolations === 0;

const evidence = {
  schema_version: "geomacro.adversarial-security-stress.v1",
  generated_at: new Date().toISOString(),
  boundary: {
    non_destructive: true,
    production_host_contacted: false,
    credentials_used: false,
    payment_performed: false,
    brute_force_network_attack_performed: false,
    note: "Envelope attacks exercise application security functions in-process. Credential-spray behavior is modeled against the production sharded budget algorithm without sending traffic to any host.",
  },
  adversarial_envelopes: {
    cases,
    failures: envelopeFailures,
    duration_ms: Number(envelopeDurationMs.toFixed(2)),
    cases_per_second: Number((cases / (envelopeDurationMs / 1000)).toFixed(2)),
    decision_codes: codeCounts,
    statuses: statusCounts,
  },
  credential_spray_model: {
    virtual_agents: sprayAgents,
    payment_global_limit_per_window: PAYMENT_GLOBAL_LIMIT,
    payment_per_client_limit_per_window: PAYMENT_PER_CLIENT_LIMIT,
    global_shards: SHARDS,
    per_shard_limit: shardLimit,
    maximum_aggregate_allowed_by_design: maximumAllowedByDesign,
    configured_global_limit: PAYMENT_GLOBAL_LIMIT,
    bounded_maximum_overshoot: aggregateOvershootBound,
    allowed: sprayAllowed,
    blocked: sprayBlocked,
    shard_population: shardCounts,
    duration_ms: Number(sprayDurationMs.toFixed(2)),
    agents_modeled_per_second: Number((sprayAgents / (sprayDurationMs / 1000)).toFixed(2)),
  },
  result: envelopeFailures === 0 && sprayBoundPass ? "PASS" : "FAIL",
};

mkdirSync("artifacts", { recursive: true });
writeFileSync(
  "artifacts/adversarial-security-stress.json",
  `${JSON.stringify(evidence, null, 2)}\n`,
);
console.log(JSON.stringify(evidence, null, 2));

if (envelopeFailures !== 0) {
  throw new Error(`Adversarial envelope stress had ${envelopeFailures} unexpected passes`);
}
if (!sprayBoundPass) {
  throw new Error("Credential-spray sharded budget model violated its bounded global allowance");
}
