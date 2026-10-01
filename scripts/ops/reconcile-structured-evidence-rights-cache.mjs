#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";

const PROJECT_URL = "https://ldpwajisioljyjtojvfx.supabase.co";
const BATCH_LIMIT = 500;
const DB_CHUNK = 100;
const MAX_ATTEMPTS = 4;

const url = String(process.env.APP_SUPABASE_URL ?? "").trim();
const role = String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

if (url !== PROJECT_URL || !role) {
  throw new Error("STRUCTURED_EVIDENCE_RIGHTS_RECONCILE_CONFIG_INVALID");
}

const db = createClient(url, role, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const chunks = (values, size) =>
  Array.from(
    { length: Math.ceil(values.length / size) },
    (_, index) => values.slice(index * size, (index + 1) * size),
  );

const normalizeList = (value) =>
  Array.isArray(value) ? value.map(String).sort() : [];

const sameList = (a, b) =>
  JSON.stringify(normalizeList(a)) === JSON.stringify(normalizeList(b));

function transient(error) {
  const code = String(error?.code ?? "");
  const message = String(error?.message ?? error ?? "");
  return (
    code === "57014" ||
    /(?:502|503|504|timeout|timed out|fetch failed|connection reset|bad gateway|service unavailable)/i.test(
      `${code} ${message}`,
    )
  );
}

async function queryWithRetry(label, operation) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const result = await operation();
    if (!result?.error) return result;
    lastError = result.error;
    if (!transient(lastError) || attempt === MAX_ATTEMPTS) break;
    await sleep(attempt * 1000);
  }
  throw new Error(
    `${label}_${lastError?.code ?? "unknown"}: ${lastError?.message ?? "unknown"}`,
  );
}

async function candidateEventIds() {
  const { data } = await queryWithRetry(
    "STRUCTURED_EVIDENCE_RIGHTS_RECONCILE_CANDIDATES_FAILED",
    () =>
      db.rpc("geomacro_structured_evidence_delete_candidates", {
        p_limit: BATCH_LIMIT,
      }),
  );

  return [
    ...new Set(
      (Array.isArray(data) ? data : [])
        .map((row) => String(row?.event_id ?? ""))
        .filter((id) => /^[0-9a-f-]{36}$/i.test(id)),
    ),
  ];
}

async function snapshots(eventIds) {
  if (!eventIds.length) return { stale: [] };

  const rightsRows = [];
  const eventRows = [];
  for (const part of chunks(eventIds, DB_CHUNK)) {
    const [{ data: rights }, { data: events }] = await Promise.all([
      queryWithRetry(
        "STRUCTURED_EVIDENCE_RIGHTS_RECONCILE_RIGHTS_READ_FAILED",
        () =>
          db.rpc("geomacro_structured_event_rights_snapshot", {
            p_event_ids: part,
          }),
      ),
      queryWithRetry(
        "STRUCTURED_EVIDENCE_RIGHTS_RECONCILE_EVENT_READ_FAILED",
        () =>
          db
            .from("live_structured_events")
            .select(
              "id,commercial_eligibility_status,commercial_eligibility_reason_codes",
            )
            .in("id", part),
      ),
    ]);
    rightsRows.push(...(rights ?? []));
    eventRows.push(...(events ?? []));
  }

  const rightsById = new Map(
    rightsRows.map((row) => [String(row.event_id), row]),
  );
  const eventsById = new Map(
    eventRows.map((row) => [String(row.id), row]),
  );

  if (rightsById.size !== eventIds.length || eventsById.size !== eventIds.length) {
    throw new Error("STRUCTURED_EVIDENCE_RIGHTS_RECONCILE_INCOMPLETE");
  }

  const stale = eventIds.filter((id) => {
    const authoritative = rightsById.get(id);
    const cached = eventsById.get(id);
    return (
      String(cached?.commercial_eligibility_status ?? "") !==
        String(authoritative?.evaluated_status ?? "") ||
      !sameList(
        cached?.commercial_eligibility_reason_codes,
        authoritative?.reason_codes,
      )
    );
  });

  return { stale };
}

const eventIds = await candidateEventIds();
if (!eventIds.length) {
  console.log(
    JSON.stringify({
      ok: true,
      status: "complete",
      candidate_events: 0,
      reconciled_events: 0,
    }),
  );
  process.exit(0);
}

const before = await snapshots(eventIds);
for (const eventId of before.stale) {
  await queryWithRetry(
    "STRUCTURED_EVIDENCE_RIGHTS_RECONCILE_WRITE_FAILED",
    () =>
      db.rpc("recompute_structured_event_commercial_eligibility", {
        p_event_id: eventId,
      }),
  );
}

const after = await snapshots(eventIds);
if (after.stale.length !== 0) {
  throw new Error("STRUCTURED_EVIDENCE_RIGHTS_RECONCILE_VERIFY_FAILED");
}

console.log(
  JSON.stringify({
    ok: true,
    status: "ready",
    candidate_events: eventIds.length,
    reconciled_events: before.stale.length,
    stale_after: after.stale.length,
    rights_source: "targeted_rpc",
  }),
);
