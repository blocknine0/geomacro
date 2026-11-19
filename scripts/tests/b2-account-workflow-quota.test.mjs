import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  B2_DAILY_LIMITS,
  B2_P0B_DURABLE_SPOOL_DAILY_LIMITS,
  reserveB2AccountQuota,
} from "../../workers/control-plane/src/b2-account-quota.mjs";

function createD1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE schema_meta (
    name TEXT PRIMARY KEY, version INTEGER NOT NULL, updated_at TEXT NOT NULL
  ); INSERT INTO schema_meta VALUES ('control-plane', 4, 'test');`);
  for (const migration of [
    "0014_b2_account_daily_request_quota.sql",
    "0015_b2_workflow_daily_quota.sql",
  ]) {
    sqlite.exec(readFileSync(new URL(
      `../../workers/control-plane/migrations/${migration}`, import.meta.url,
    ), "utf8"));
  }
  return {
    sqlite,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              return sqlite.prepare(sql).get(...args) ?? null;
            },
            async run() {
              sqlite.prepare(sql).run(...args);
              return { success: true };
            },
          };
        },
      };
    },
  };
}

const NOW = new Date("2026-11-19T12:00:00.000Z");

test("P0B durable spool stops at its daily workflow cap and protected jobs retain headroom", async () => {
  const db = createD1();
  const reserve = (kind, workflow_id) => reserveB2AccountQuota(db, {
    kind, workflow_id,
  }, { now: NOW });

  for (let i = 0; i < B2_P0B_DURABLE_SPOOL_DAILY_LIMITS.GET; i++) {
    assert.equal((await reserve("GET", "p0b_durable_spool")).ok, true);
  }
  for (let i = 0; i < B2_P0B_DURABLE_SPOOL_DAILY_LIMITS.PUT; i++) {
    assert.equal((await reserve("PUT", "p0b_durable_spool")).ok, true);
  }
  const p0bGetDenied = await reserve("GET", "p0b_durable_spool");
  const p0bPutDenied = await reserve("PUT", "p0b_durable_spool");
  assert.equal(p0bGetDenied.error, "B2_WORKFLOW_DAILY_QUOTA_EXHAUSTED");
  assert.equal(p0bPutDenied.error, "B2_WORKFLOW_DAILY_QUOTA_EXHAUSTED");
  assert.deepEqual(p0bGetDenied.workflow_limits,
    B2_P0B_DURABLE_SPOOL_DAILY_LIMITS);

  // Non-release traffic can use only its envelope; this proves the release
  // reserve stays available even after P0B reaches its cap.
  for (let i = 0; i < 690; i++) {
    assert.equal((await reserve("GET", "routine_ingestion")).ok, true);
  }
  for (let i = 0; i < 200; i++) {
    assert.equal((await reserve("PUT", "routine_ingestion")).ok, true);
  }
  assert.equal((await reserve("GET", "routine_ingestion")).error,
    "B2_GLOBAL_DAILY_QUOTA_EXHAUSTED");

  for (const workflow_id of [
    "phase2h_private_raw_archive",
    "phase2h_b2_retention",
    "derived_news_backup",
    "gdelt_v2_event_sync",
  ]) {
    for (const kind of ["GET", "PUT"]) {
      const result = await reserve(kind, workflow_id);
      assert.equal(result.ok, true, `${workflow_id} ${kind} should remain admitted`);
      assert.equal(result.release_reserve_protected, true);
    }
  }

  const quota = db.sqlite.prepare(
    "SELECT total_requests,get_requests,put_requests FROM b2_account_daily_request_quota WHERE day_utc=?",
  ).get("2026-11-19");
  assert.deepEqual({ ...quota }, {
    total_requests: 2_198,
    get_requests: 1_494,
    put_requests: 704,
  });
  assert.equal(B2_DAILY_LIMITS.total, 3_000);
  assert.equal(B2_DAILY_LIMITS.PUT, 1_000);
});

test("P0B daily counters reset at the UTC day boundary", async () => {
  const db = createD1();
  const priorDay = await reserveB2AccountQuota(db, {
    kind: "PUT", workflow_id: "p0b_durable_spool",
  }, { now: new Date("2026-11-19T23:59:59.000Z") });
  const nextDay = await reserveB2AccountQuota(db, {
    kind: "PUT", workflow_id: "p0b_durable_spool",
  }, { now: new Date("2026-11-20T00:00:00.000Z") });
  assert.equal(priorDay.ok, true);
  assert.equal(nextDay.ok, true);
  assert.equal(nextDay.workflow_used.PUT, 1);
  assert.equal(nextDay.day_utc, "2026-11-20");
});
