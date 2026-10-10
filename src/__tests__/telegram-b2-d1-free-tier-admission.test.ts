import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  evaluateTelegramConsumerAdmission,
  readTelegramConsumerQueue,
  TELEGRAM_DRAIN_MAX,
  TELEGRAM_ADMISSION_SCHEMA,
} from "../../scripts/ops/check-telegram-b2-d1-admission.mjs";
import { B2_DAILY_LIMITS } from "../../workers/control-plane/src/b2-account-quota.mjs";

const NOW=new Date("2026-10-10T10:00:00.000Z");
const digest="b".repeat(64);
const lead={
  delivery_id:"tg_"+"a".repeat(32)+"_"+digest.slice(0,16),
  b2_sha256:digest,
  state:"PENDING",
  source_channel_key:"privatechannel",
  b2_object_key:"telegram/leads/2026/10/10/privatechannel/123-"+digest.slice(0,16)+".json.gz",
};
const queue=(rows:unknown[])=>[{success:true,results:rows}];
const budget={ok:true,mode:"normal",bulk_write_allowed:true,
  policy:{recurring_ingest_allowed:true,bulk_supabase_writes_allowed:true}};
const validUsed={GET:3,PUT:5,HEAD:0,NATIVE_AUTH:0,total:8};
const quota=(used={...validUsed},day=NOW.toISOString().slice(0,10))=>({
  ok:true,schema:"geomacro.b2-account-quota-status.v1",
  day_utc:day,limits:B2_DAILY_LIMITS,
  account_wide_reporting_requires_all_clients_governed:true,used,
});

describe("#1827 Telegram: shared D1 quota + frozen Postgres no-B2 consumer",()=>{
  it("returns zero-work receipt for an empty D1 queue, without requiring Supabase or B2 credentials",()=>{
    expect(readTelegramConsumerQueue(queue([]))).toBe(0);
    const result=evaluateTelegramConsumerAdmission({pending:0,now:NOW});
    expect(result).toMatchObject({
      schema:TELEGRAM_ADMISSION_SCHEMA,
      status:"NO_PENDING_AUTHORIZED_LEADS",
      pending_count:0,can_consume:false,no_b2_network:true,
      b2_requests:0,supabase_writes:0,usdc_spent:0,
      source_data_newly_verified:false,
      commercial_eligible:false,
    });
  });

  it("holds all queued private leads in D1 while Supabase writer is frozen or warn-level",()=>{
    expect(readTelegramConsumerQueue(queue([lead]))).toBe(1);
    for(const frozen of [
      {ok:true,mode:"frozen",bulk_write_allowed:false,
        policy:{recurring_ingest_allowed:false,bulk_supabase_writes_allowed:false}},
      {ok:true,mode:"warning",bulk_write_allowed:true,
        policy:{recurring_ingest_allowed:false,bulk_supabase_writes_allowed:true}},
      null,
    ]) {
      const result=evaluateTelegramConsumerAdmission({
        pending:1,supabase:frozen,quota:quota(),now:NOW,
      });
      expect(result).toMatchObject({
        can_consume:false,no_b2_network:true,
        status:"TELEGRAM_CANONICAL_WRITER_QUOTA_HELD",
        b2_requests:0,supabase_writes:0,
      });
    }
  });

  it("requires genuine current UTC D1 status, exact server ceilings and integer usage",()=>{
    const invalid=[
      null,
      {...quota(),day_utc:"2026-10-09"},
      {...quota(),schema:"self-reported"},
      {...quota(),account_wide_reporting_requires_all_clients_governed:false},
      {...quota(),limits:{...B2_DAILY_LIMITS,GET:999}},
      {...quota(),used:{...validUsed,total:7}},
      {...quota(),used:{...validUsed,GET:-1,total:4}},
      {...quota(),used:{...validUsed,GET:25,total:30}},
    ];
    for(const q of invalid){
      expect(()=>evaluateTelegramConsumerAdmission({
        pending:1,supabase:budget,quota:q,now:NOW,
      })).toThrow();
    }
  });

  it("admits at most four GETs and explicitly does not pre-reserve a ticket",()=>{
    expect(TELEGRAM_DRAIN_MAX).toBe(4);
    const accepted=evaluateTelegramConsumerAdmission({
      pending:4,supabase:budget,quota:quota(),now:NOW,
    });
    expect(accepted).toMatchObject({
      can_consume:true,
      no_b2_request_yet:true,
      reservation_required_before_each_get:true,
      status:"CAN_CONSUME_WITH_ATOMIC_PER_GET_D1_TICKETS",
      b2_requests:0,
    });
    const exhausted=evaluateTelegramConsumerAdmission({
      pending:4,supabase:budget,
      quota:quota({GET:B2_DAILY_LIMITS.GET-2,PUT:0,HEAD:0,NATIVE_AUTH:0,
        total:B2_DAILY_LIMITS.GET-2}),now:NOW,
    });
    expect(exhausted).toMatchObject({
      can_consume:false,status:"TELEGRAM_SHARED_B2_DAILY_GET_BUDGET_HELD",
      b2_requests:0,
    });
  });

  it("rejects malformed queue, a duplicate receipt and any >4 pending batch before private B2 GET",()=>{
    for(const body of [
      [],
      [{success:false,results:[lead]}],
      [{results:"oops"}],
      queue([lead,lead]),
      queue([{...lead,delivery_id:"bad"}]),
      queue([{...lead,b2_sha256:"wrong"}]),
      queue([{...lead,state:"CONSUMED"}]),
      queue(Array.from({length:5},(_,i)=>({...lead,
        delivery_id:"tg_"+"a".repeat(32)+"_"+String(i).padStart(16,"0")}))),
    ])expect(()=>readTelegramConsumerQueue(body)).toThrow();
  });

  it("runtime cannot start a B2 GET unless canonical S3 client reserves D1 atomic GET",()=>{
    const flow=readFileSync(".github/workflows/telegram-b2-d1-consumer.yml","utf8");
    const drainer=readFileSync("scripts/ops/drain-telegram-b2-leads.mjs","utf8");
    const b2=readFileSync("scripts/ops/b2-s3-client.mjs","utf8");
    const admission=readFileSync("scripts/ops/check-telegram-b2-d1-admission.mjs","utf8");
    expect(flow).toContain('cron: "17 * * * *"');
    expect(flow).not.toContain('cron: "*/5 * * * *"');
    expect(flow).toContain('B2_REQUEST_BUDGET: "4"');
    expect(flow).toContain('B2_ACCOUNT_QUOTA_REQUIRED: "1"');
    expect(flow).toContain("B2_ACCOUNT_QUOTA_WORKFLOW_ID: telegram_b2_d1_consumer");
    expect(flow).toContain('echo "D1_DATABASE_ID=$DB_ID" >> "$GITHUB_ENV"');
    expect(flow).toContain("TELEGRAM_SHARED_D1_B2_QUOTA_V5_REQUIRED");
    expect(flow).toContain("LIMIT 4;");
    expect(flow).toContain("--max 4");
    expect(flow).toContain("steps.admission.outputs.can_consume == 'true'");
    expect(flow).toContain("check-telegram-b2-d1-admission.mjs --stage budget");
    expect(admission).toContain("supabase-free-tier-budget.mjs");
    expect(admission).toContain("createB2D1AccountGovernor");
    expect(drainer).toContain("createB2Client({");
    expect(drainer).toContain('allowedKeyPrefixes: ["telegram/leads/"]');
    expect(b2).toContain('globalAccountGovernor.reserve("GET")');
    expect(b2).toContain("B2_ACCOUNT_QUOTA_REQUIRED");
    expect(flow).toContain("SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}");
    expect(flow).not.toContain("SUPABASE_SERVICE_ROLE_KEY: ${{ secrets");
  });

  it("keeps exact successful canonical Postgres acknowledgment and unresolved leads for recovery",()=>{
    const workflow=readFileSync(".github/workflows/telegram-b2-d1-consumer.yml","utf8");
    expect(workflow).toContain("WHERE delivery_id='$delivery' AND state='PENDING'");
    expect(workflow).toContain("SET state='CONSUMED',consumed_at=datetime('now')");
    expect(workflow).toContain("CANONICAL_INGEST_FAILED");
    expect(workflow).toContain("Upload bounded Telegram bridge evidence");
    expect(workflow).toContain("artifacts/telegram-lead-intake/verified/summary.json");
    expect(workflow).not.toContain("DELETE FROM telegram_signal_lead_queue WHERE state='PENDING'");
  });
});
