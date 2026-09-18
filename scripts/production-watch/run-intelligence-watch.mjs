#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE_URL = String(process.env.GEOMACRO_WATCH_BASE_URL || "https://geomacro.live").replace(/\/$/, "");
const WATCH_TOKEN = String(process.env.GEOMACRO_PRODUCTION_WATCH_TOKEN || "").trim();
const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const SLOT = Number(process.env.WATCH_SLOT || 0);
const BATCH_SIZE = Number(process.env.WATCH_BATCH_SIZE || 250);
const WINDOW_DAYS = Number(process.env.WATCH_WINDOW_DAYS || 7);
const OUTPUT_DIR = String(process.env.WATCH_OUTPUT_DIR || "production-watch-artifacts");
const EXPECTED_PRODUCTION_SHA = String(process.env.GEOMACRO_EXPECTED_PRODUCTION_SHA || "").trim().toLowerCase();

const CATEGORIES = ["geopolitics", "macro", "critical_minerals"];

const TOPICS = {
  geopolitics: [
    "sanctions pressure",
    "cross-border conflict risk",
    "military escalation",
    "diplomatic negotiations",
    "trade restrictions",
    "maritime security",
    "border tensions",
    "strategic alliances",
    "energy-security disputes",
    "technology controls",
    "political instability",
    "security guarantees",
    "shipping corridor exposure",
    "foreign-policy shifts",
    "regional spillovers",
    "defence posture changes",
    "economic coercion",
    "strategic infrastructure risk",
    "ceasefire durability",
    "export restrictions",
  ],
  macro: [
    "inflation pressure",
    "interest-rate expectations",
    "central-bank policy",
    "economic growth",
    "GDP momentum",
    "sovereign debt pressure",
    "government bond yields",
    "currency pressure",
    "fiscal policy",
    "unemployment conditions",
    "credit conditions",
    "banking-system stress",
    "commodity-price pressure",
    "trade-driven inflation",
    "investment conditions",
    "consumer demand",
    "manufacturing activity",
    "public-finance sustainability",
    "foreign-exchange exposure",
    "monetary-policy divergence",
  ],
  critical_minerals: [
    "rare earth supply",
    "rare earth export controls",
    "neodymium magnet supply",
    "dysprosium availability",
    "terbium availability",
    "rare earth processing capacity",
    "critical-mineral mining",
    "critical-mineral refining",
    "permanent magnet supply chains",
    "strategic mineral stockpiles",
    "critical-mineral trade restrictions",
    "critical-mineral substitution",
    "mineral logistics bottlenecks",
    "battery mineral supply",
    "cobalt supply",
    "lithium supply",
    "graphite supply",
    "semiconductor mineral exposure",
    "downstream manufacturing pressure",
    "strategic-resource concentration",
  ],
};

const ANGLES = [
  "supply concentration and strategic leverage",
  "trade exposure and restrictions",
  "industrial capacity and bottlenecks",
  "pricing and downstream pressure",
  "production and investment constraints",
  "transport and logistics exposure",
  "policy changes and market sensitivity",
  "export controls and substitution capacity",
  "security exposure and continuity",
  "financial and business impact",
  "government response and policy credibility",
  "cross-border spillovers",
  "near-term trajectory signals",
  "changes in stored evidence confidence",
  "interaction with other risk domains",
  "resilience and concentration",
];

const HISTORICAL_OFFSETS_DAYS = [14, 30, 60, 90, 180, 365, 730];

const FRAMES = [
  "a buyer's risk review",
  "a treasury risk review",
  "a supply-chain risk review",
  "an institutional research brief",
  "a policy-monitoring brief",
  "an agent decision-support review",
  "a strategic sourcing review",
  "a market-monitoring review",
  "a country-risk comparison",
  "a corridor-risk comparison",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isoDateUTC(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function dayDiff(a, b) {
  const start = Date.parse(a + "T00:00:00Z");
  const end = Date.parse(b + "T00:00:00Z");
  return Math.floor((end - start) / 86_400_000);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function makeQuestion(watchDate, probeIndex) {
  const pairIndex = Math.floor(probeIndex / 2);
  const mode = probeIndex % 2 === 0 ? "current" : "historical";
  const category = CATEGORIES[pairIndex % CATEGORIES.length];
  const topics = TOPICS[category];
  const topic = topics[(pairIndex * 7 + Math.floor(pairIndex / CATEGORIES.length)) % topics.length];
  const angle = ANGLES[(pairIndex * 11 + probeIndex) % ANGLES.length];
  const frame = FRAMES[(pairIndex * 5 + probeIndex) % FRAMES.length];

  if (mode === "current") {
    return {
      category,
      mode,
      as_of: null,
      question:
        `For ${frame}, what does Geomacro's stored intelligence indicate about ${topic}, especially ${angle}, in the ${watchDate} monitoring cycle?`,
    };
  }

  const offsetDays = HISTORICAL_OFFSETS_DAYS[pairIndex % HISTORICAL_OFFSETS_DAYS.length];
  const historical = new Date(Date.parse(`${watchDate}T12:00:00Z`) - offsetDays * 86_400_000);
  historical.setUTCHours((pairIndex * 5 + probeIndex) % 24, (pairIndex * 11) % 60, 0, 0);
  const asOf = historical.toISOString();

  return {
    category,
    mode,
    as_of: asOf,
    question:
      `As of ${asOf.slice(0, 10)}, for ${frame}, what did Geomacro's stored intelligence show about ${topic}, especially ${angle}, and what was the recorded risk context?`,
  };
}

async function supabaseFetch(path, init = {}) {
  assert(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      ...init.headers,
    },
  });
}

async function getExistingIndices(watchDate, start, end) {
  const query =
    `production_intelligence_watch_results?select=probe_index&watch_date=eq.${encodeURIComponent(watchDate)}&probe_index=gte.${start}&probe_index=lt.${end}`;
  const response = await supabaseFetch(query, { method: "GET" });
  assert(response.ok, `Supabase existing-index query failed: HTTP ${response.status}`);
  const rows = await response.json();
  return new Set((rows || []).map((row) => Number(row.probe_index)));
}

async function storeRows(rows) {
  if (!rows.length) return;
  const response = await supabaseFetch("production_intelligence_watch_results", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=minimal,resolution=ignore-duplicates",
    },
    body: JSON.stringify(rows),
  });
  const body = await response.text();
  assert(response.ok, `Supabase watch-ledger insert failed: HTTP ${response.status} ${body.slice(0, 500)}`);
}

async function findWindowStart() {
  const response = await supabaseFetch(
    "production_intelligence_watch_results?select=watch_date&order=watch_date.asc&limit=1",
    { method: "GET" },
  );
  assert(response.ok, `Supabase watch-window query failed: HTTP ${response.status}`);
  const rows = await response.json();
  return rows?.[0]?.watch_date ? String(rows[0].watch_date) : null;
}

async function fetchBuildMarker() {
  try {
    const response = await fetch(`${BASE_URL}/.well-known/geomacro-build.json`, {
      headers: { Accept: "application/json", "Cache-Control": "no-cache" },
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    const raw = await response.text();
    if (!response.ok) return { status: response.status, raw, sha: null, schema: null, verified: false };
    let body = null;
    try {
      body = JSON.parse(raw);
    } catch {
      return { status: response.status, raw, sha: null, schema: null, verified: false };
    }
    return {
      status: response.status,
      raw,
      sha: String(body?.canonical_main_sha || "").trim().toLowerCase() || null,
      schema: String(body?.schema_version || "").trim() || null,
      verified: String(body?.schema_version || "").trim() === "geomacro.deployment-build.v1" &&
        /^[0-9a-f]{40}$/.test(String(body?.canonical_main_sha || "").trim().toLowerCase()) &&
        String(body?.canonical_main_sha || "").trim().toLowerCase() === EXPECTED_PRODUCTION_SHA,
    };
  } catch (error) {
    return { status: 0, raw: String(error), sha: null, schema: null, verified: false };
  }
}

async function probe(probe) {
  const payload = {
    watch_date: probe.watchDate,
    probe_index: probe.probeIndex,
    category: probe.category,
    mode: probe.mode,
    as_of: probe.as_of,
    question: probe.question,
  };
  const startedAt = Date.now();

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${BASE_URL}/api/production-watch/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-geomacro-production-watch-token": WATCH_TOKEN,
        },
        body: JSON.stringify(payload),
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      });
      const raw = await response.text();
      const latencyMs = Date.now() - startedAt;
      let json = null;
      try {
        json = JSON.parse(raw);
      } catch {
        json = null;
      }

      if ((response.status === 429 || response.status >= 500) && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
        continue;
      }

      const answer = json?.answer;
      const watch = json?.watch;
      const outcome =
        response.ok && answer
          ? answer.insufficient_evidence
            ? "insufficient_evidence"
            : watch?.current_evidence_count === 0 && watch?.historical_evidence_count === 0
              ? "build_unverified"
              : "success"
          : response.status >= 500 || response.status === 0
            ? "production_error"
            : "invalid_response";

      return {
        watch_run_id: probe.watchRunId,
        watch_date: probe.watchDate,
        probe_index: probe.probeIndex,
        category: probe.category,
        mode: probe.mode,
        as_of: probe.as_of,
        build_verified: Boolean(probe.build.schema === "geomacro.deployment-build.v1" && probe.build.sha),
        question: probe.question,
        question_sha256: sha256(probe.question),
        request_id: json?.request_id ? String(json.request_id) : null,
        executed_at: new Date().toISOString(),
        http_status: response.status,
        outcome,
        response_sha256: sha256(raw),
        response_bytes: Buffer.byteLength(raw),
        response_raw: raw,
        response_json: json,
        evidence_metadata: watch?.evidence_timing
          ? {
              evidence_timing: watch.evidence_timing,
              current_evidence_count: Number(watch.current_evidence_count || 0),
              historical_evidence_count: Number(watch.historical_evidence_count || 0),
            }
          : {},
        current_gri:
          typeof answer?.gri === "number" && Number.isFinite(answer.gri) ? answer.gri : null,
        mean_relevance:
          typeof answer?.mean_relevance === "number" && Number.isFinite(answer.mean_relevance)
            ? answer.mean_relevance
            : null,
        evidence_count: Array.isArray(answer?.evidence) ? answer.evidence.length : 0,
        current_evidence_count: Number(watch?.current_evidence_count || 0),
        historical_evidence_count: Number(watch?.historical_evidence_count || 0),
        latency_ms: latencyMs,
        error_code: json?.error?.code ? String(json.error.code) : null,
        error_message: json?.error?.message ? String(json.error.message).slice(0, 500) : null,
        production_build_sha: probe.build.sha,
        production_build_schema: probe.build.schema,
      };
    } catch (error) {
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
        continue;
      }

      const message = error instanceof Error ? error.message : String(error);
      return {
        watch_run_id: probe.watchRunId,
        watch_date: probe.watchDate,
        probe_index: probe.probeIndex,
        category: probe.category,
        mode: probe.mode,
        as_of: probe.as_of,
        build_verified: Boolean(probe.build.schema === "geomacro.deployment-build.v1" && probe.build.sha),
        question: probe.question,
        question_sha256: sha256(probe.question),
        request_id: null,
        executed_at: new Date().toISOString(),
        http_status: null,
        outcome: "transport_error",
        response_sha256: null,
        response_bytes: 0,
        response_raw: null,
        response_json: null,
        evidence_metadata: {},
        current_gri: null,
        mean_relevance: null,
        evidence_count: 0,
        current_evidence_count: 0,
        historical_evidence_count: 0,
        latency_ms: Date.now() - startedAt,
        error_code: "WATCH_TRANSPORT_ERROR",
        error_message: message.slice(0, 500),
        production_build_sha: probe.build.sha,
        production_build_schema: probe.build.schema,
      };
    }
  }

  throw new Error("Unreachable");
}

async function main() {
  assert(Number.isInteger(SLOT) && SLOT >= 0 && SLOT <= 3, "WATCH_SLOT must be 0..3");
  assert(BATCH_SIZE === 250, "Production watch batch size is fixed at 250 probes");
  assert(WATCH_TOKEN.length >= 32, "GEOMACRO_PRODUCTION_WATCH_TOKEN must be at least 32 characters");
  assert(/^[0-9a-f]{40}$/.test(EXPECTED_PRODUCTION_SHA), "GEOMACRO_EXPECTED_PRODUCTION_SHA must be the 40-char canonical main SHA");

  const watchDate = isoDateUTC();
  const windowStart = await findWindowStart();
  if (windowStart && dayDiff(windowStart, watchDate) >= WINDOW_DAYS) {
    console.log(`WATCH_WINDOW_COMPLETE start=${windowStart} today=${watchDate} days=${WINDOW_DAYS}`);
    return;
  }

  const start = SLOT * BATCH_SIZE;
  const end = start + BATCH_SIZE;
  const existing = await getExistingIndices(watchDate, start, end);
  const build = await fetchBuildMarker();
  const watchRunId = randomUUID();

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const artifactPath = join(OUTPUT_DIR, `watch-${watchDate}-slot-${SLOT}.jsonl`);
  if (!existsSync(artifactPath)) writeFileSync(artifactPath, "");

  const rows = [];
  let completed = 0;

  for (let probeIndex = start; probeIndex < end; probeIndex += 1) {
    if (existing.has(probeIndex)) continue;

    const generated = makeQuestion(watchDate, probeIndex);
    assert(generated.question.length <= 300, `Generated question exceeds 300 chars: ${generated.question}`);

    const row = await probe({
      watchRunId,
      watchDate,
      probeIndex,
      ...generated,
      build,
    });

    rows.push(row);
    appendFileSync(
      artifactPath,
      JSON.stringify({
        ...row,
        response_json: undefined,
      }) + "\n",
    );
    completed += 1;

    if (rows.length >= 10) {
      await storeRows(rows.splice(0, rows.length));
    }

    if (probeIndex + 1 < end) {
      await new Promise((resolve) => setTimeout(resolve, 3_100));
    }
  }

  if (rows.length) await storeRows(rows);

  console.log(
    JSON.stringify(
      {
        ok: true,
        watch_date: watchDate,
        slot: SLOT,
        expected_batch: BATCH_SIZE,
        new_probes_recorded: completed,
        existing_probes_skipped: existing.size,
        production_build_sha: build.sha,
        production_build_schema: build.schema,
        artifact_path: artifactPath,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});