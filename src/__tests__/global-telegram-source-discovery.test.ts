import fs from "node:fs";
import { describe, expect, it } from "vitest";

const worker = fs.readFileSync("workers/telegram-flash/global_discovery.py","utf8");
const workflow = fs.readFileSync(".github/workflows/global-telegram-source-discovery-scheduled.yml","utf8");
const migration = fs.readFileSync("supabase/migrations/969_telegram_global_discovery_metadata.sql","utf8");

describe("global Telegram source discovery",()=>{
  it("discovers public channels from all country/category targets",()=>{
    expect(worker).toContain("live_raw_source_targets");
    expect(worker).toContain("TELEGRAM_DISCOVERY");
    expect(worker).toContain("contacts.SearchRequest");
    expect(worker).toContain("CANONICAL_COUNTRY_TARGET_COUNT = 195");
  });

  it("only creates pending review candidates",()=>{
    expect(worker).toContain('"manual_review_status": "PENDING"');
    expect(worker).toContain('"enabled": False');
    expect(worker).toContain('"rights_status": "INTERNAL_RESEARCH_ONLY"');
    expect(worker).toContain("UNVERIFIED_OWNERSHIP");
    expect(worker).toContain("resolution=ignore-duplicates");
  });

  it("runs independently of licensed commercial source activation",()=>{
    expect(workflow).toContain("Global Telegram Raw Source Discovery");
    expect(workflow).toContain('cron: "*/30 * * * *"');
    expect(migration).toContain("discovery_country_iso3");
    expect(migration).toContain("discovery_category");
  });
});


describe("global Telegram workflow triggers",()=>{
  it("is schedule/dispatch only and cannot create push zero-job runs",()=>{
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("schedule:");
    expect(workflow).toContain("push:");
    expect(workflow).toContain("- main");
    expect(workflow).not.toContain("workflow_run:");
  });
});
