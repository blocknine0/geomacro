import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  validateTelegramDurableIntake,
  telegramD1IntakeSql,
  telegramD1AckSql,
  telegramD1ReadbackSql,
} from "../../scripts/ops/intake-telegram-b2-d1-leads.mjs";

const sha="b".repeat(64);
const signal="tg_"+"a".repeat(32);
const delivery=signal+"_"+sha.slice(0,16);
const item={
  delivery_id:delivery,signal_id:signal,source_channel_key:"verifiednews",
  source_record_id:123,published_at:"2026-10-15T09:00:00.000Z",
  b2_object_key:"telegram/leads/2026/10/15/verifiednews/123-"+sha.slice(0,16)+".json.gz",
  b2_sha256:sha,queue_state:"PENDING",verification_status:"UNVERIFIED",
  scoring_eligible:false,commercial_eligible:false,
};
const payload={
  source_id:"telegram_authorized_publisher_feed",
  source_record_id:123,source_channel_key:"verifiednews",
  published_at:item.published_at,headline:"Sensitive private post for test only",
  verification_status:"UNVERIFIED",raw_payload:null,
};
const normalize=(j:unknown)=>JSON.stringify(j,null,2)+"\n";
describe("Telegram Supabase-free durable D1 private handoff",()=>{
  it("preserves exact queue SHA, source identity, native date and unverified boundaries",()=>{
    const row=validateTelegramDurableIntake(item,payload,normalize(payload));
    expect(row.delivery_id).toBe(delivery);
    expect(row.source_id).toBe("telegram_authorized_publisher_feed");
    expect(row.sanitized_payload_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(telegramD1IntakeSql(row)).toContain("INSERT OR IGNORE INTO telegram_private_unverified_leads");
    expect(telegramD1IntakeSql(row)).toContain("state='PENDING'");
    expect(telegramD1IntakeSql(row)).not.toContain(payload.headline);
    expect(telegramD1ReadbackSql(row)).toContain("sanitized_payload_sha256");
  });
  it("ACK is impossible without exact durable hash-matched private D1 row",()=>{
    const row=validateTelegramDurableIntake(item,payload,normalize(payload));
    const sql=telegramD1AckSql(row);
    expect(sql).toContain("EXISTS(SELECT 1 FROM telegram_private_unverified_leads");
    expect(sql).toContain("sanitized_payload_sha256");
    expect(sql).toContain("b2_sha256");
    expect(sql).toContain("verification_status='UNVERIFIED'");
    expect(sql).toContain("scoring_eligible=0 AND commercial_eligible=0");
    expect(sql).toContain("state='PENDING'");
    expect(sql).not.toContain(payload.headline);
  });
  it("rejects tampered queue, payload, forged eligibility and foreign channel",()=>{
    for(const v of [
      {...item,b2_sha256:"c".repeat(64)},
      {...item,source_channel_key:"otherchannel"},
      {...item,b2_object_key:"telegram/leads/2026/10/15/otherchannel/123-"+sha.slice(0,16)+".json.gz"},
      {...item,queue_state:"CONSUMED"},
      {...item,scoring_eligible:true},
      {...item,commercial_eligible:true},
    ])expect(()=>validateTelegramDurableIntake(v,payload,normalize(payload))).toThrow();
    for(const v of [
      {...payload,source_id:"unknown_feed"},
      {...payload,verification_status:"VERIFIED"},
      {...payload,headline:""},
      {...payload,source_record_id:124},
      {...payload,published_at:"2026-10-16T09:00:00.000Z"},
    ])expect(()=>validateTelegramDurableIntake(item,v,normalize(v))).toThrow();
  });
  it("requires a private storage migration and leaves older Telegram lead table immutable",()=>{
    const migration=readFileSync("workers/control-plane/migrations/0018_telegram_private_unverified_b2_intake.sql","utf8");
    const workflow=readFileSync(".github/workflows/telegram-b2-d1-consumer.yml","utf8");
    expect(migration).toContain("create table if not exists telegram_private_unverified_leads");
    expect(migration).toContain("check (verification_status = 'UNVERIFIED')");
    expect(migration).toContain("check (scoring_eligible = 0)");
    expect(migration).toContain("check (commercial_eligible = 0)");
    expect(migration).not.toContain("headline text");
    expect(migration).not.toContain("raw_payload");
    expect(workflow).not.toContain("scripts/run-live-flash-ingest-local.ts");
    expect(workflow).toContain("scripts/ops/intake-telegram-b2-d1-leads.mjs");
    expect(workflow).not.toContain("GRI_DB_MODE: direct_postgres");
  });
});
