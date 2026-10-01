#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";

const PROJECT_URL = "https://ldpwajisioljyjtojvfx.supabase.co";
const BATCH_LIMIT = 500;

const url = String(process.env.APP_SUPABASE_URL ?? "").trim();
const role = String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

if (url !== PROJECT_URL || !role) {
  throw new Error("STRUCTURED_EVIDENCE_RIGHTS_RECONCILE_CONFIG_INVALID");
}

const db = createClient(url, role, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const normalizeList = (value) =>
  Array.isArray(value) ? value.map(String).sort() : [];

const sameList = (a, b) =>
  JSON.stringify(normalizeList(a)) === JSON.stringify(normalizeList(b));

async function candidateEventIds() {
  const { data, error } = await db.rpc(
    "geomacro_structured_evidence_delete_candidates",
    { p_limit: BATCH_LIMIT },
  );
  if (error) {
    throw new Error(
      `STRUCTURED_EVIDENCE_RIGHTS_RECONCILE_CANDIDATES_FAILED_${error.code ?? "unknown"}`,
    );
  }
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

  const [{ data: rights, error: rightsError }, { data: events, error: eventsError }] =
    await Promise.all([
      db
        .from("live_structured_event_commercial_rights_evaluation")
        .select("event_id,evaluated_status,reason_codes")
        .in("event_id", eventIds),
      db
        .from("live_structured_events")
        .select("id,commercial_eligibility_status,commercial_eligibility_reason_codes")
        .in("id", eventIds),
    ]);

  if (rightsError || eventsError) {
    throw new Error("STRUCTURED_EVIDENCE_RIGHTS_RECONCILE_READ_FAILED");
  }

  const rightsById = new Map(
    (rights ?? []).map((row) => [String(row.event_id), row]),
  );
  const eventsById = new Map(
    (events ?? []).map((row) => [String(row.id), row]),
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
  const { error } = await db.rpc(
    "recompute_structured_event_commercial_eligibility",
    { p_event_id: eventId },
  );
  if (error) {
    throw new Error(
      `STRUCTURED_EVIDENCE_RIGHTS_RECONCILE_WRITE_FAILED_${error.code ?? "unknown"}`,
    );
  }
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
  }),
);
