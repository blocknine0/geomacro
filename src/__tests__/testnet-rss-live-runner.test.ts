import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Testnet RSS live runner", () => {
  it("is a fail-closed, RSS-only scheduled runner bound to the canonical ingest", () => {
    const worker = readFileSync("workers/telegram-flash/worker.py", "utf8");
    const workflow = readFileSync(".github/workflows/testnet-rss-live-runner.yml", "utf8");
    const productionEntryPoint = readFileSync("workers/telegram-flash/production_entrypoint.py", "utf8");

    expect(worker).toContain('RSS_RUN_ONCE = env_bool("BREAKING_RSS_RUN_ONCE", False)');
    expect(worker).toContain("if RSS_RUN_ONCE and TELEGRAM_ENABLED:");
    expect(worker).toContain("if RSS_RUN_ONCE:");
    expect(worker).toContain("if not cycle_failed:");
    expect(worker).toContain("asyncio.gather(");
    expect(worker).toContain("http.client.IncompleteRead");

    expect(workflow).toContain("SUPABASE_PROJECT_ID: ${{ secrets.SUPABASE_PROJECT_ID }}");
    expect(workflow).toContain('TELEGRAM_ENABLED: "false"');
    expect(workflow).toContain('BREAKING_RSS_ENABLED: "true"');
    expect(workflow).toContain('BREAKING_RSS_RUN_ONCE: "true"');
    expect(workflow).toContain('cron: "*/15 * * * *"');
    expect(productionEntryPoint).toContain("import worker");
    expect(productionEntryPoint).not.toContain("PRODUCTION_RSS_FEEDS");
    expect(workflow).toContain("Verify every configured RSS source completed");
    expect(workflow).toContain('event.get("rss") == "ready"');
    expect(workflow).toContain('event.get("kind") == "rss_poll"');
    expect(workflow).toContain('event.get("kind") == "rss_error"');
  });
});
