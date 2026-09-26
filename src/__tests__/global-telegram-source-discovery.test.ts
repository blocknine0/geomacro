import fs from "node:fs";
import { describe, expect, it } from "vitest";

const worker = fs.readFileSync("workers/telegram-flash/global_discovery.py", "utf8");
const migration = fs.readFileSync("supabase/migrations/969_telegram_global_discovery_metadata.sql", "utf8");

describe("global Telegram source discovery", () => {
  it("keeps public Telegram discovery disabled by policy", () => {
    expect(worker).toContain('"status": "DISABLED_BY_POLICY"');
    expect(worker).toContain('"public_telegram_discovery": False');
    expect(worker).toContain('"publisher_authorized_feed_only": True');
    expect(worker).not.toContain("contacts.SearchRequest");
    expect(worker).not.toContain("TelegramClient");
    expect(worker).not.toContain("TELEGRAM_SESSION");
  });

  it("never auto-enables a Telegram source", () => {
    expect(worker).toContain('"auto_enable": False');
    expect(worker).toContain('"candidates_discovered": 0');
  });

  it("retains legacy discovery metadata only as inert schema compatibility", () => {
    const orchestrator = fs.readFileSync("scripts/intelligence-orchestrator.mjs", "utf8");
    expect(orchestrator).toContain('key: "telegram_discovery"');
    expect(migration).toContain("discovery_country_iso3");
    expect(migration).toContain("discovery_category");
  });
});
