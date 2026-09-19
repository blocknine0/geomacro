import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Testnet RSS live runner contract", () => {
  it("keeps one-shot mode RSS-only and fails closed on feed errors", () => {
    const worker = readFileSync(
      "workers/telegram-flash/worker.py",
      "utf8",
    );
    const workflow = readFileSync(
      ".github/workflows/testnet-rss-live-runner.yml",
      "utf8",
    );

    expect(worker).toContain(
      'RSS_RUN_ONCE = env_bool("BREAKING_RSS_RUN_ONCE", False)',
    );
    expect(worker).toContain(
      'if RSS_RUN_ONCE:',
    );
    expect(worker).toContain(
      'if cycle_failed:',
    );
    expect(worker).toContain(
      'if RSS_RUN_ONCE and TELEGRAM_ENABLED:',
    );

    expect(workflow).toContain(
      'BREAKING_RSS_RUN_ONCE: "true"',
    );
    expect(workflow).toContain(
      'TELEGRAM_ENABLED: "false"',
    );
    expect(workflow).toContain(
      'BREAKING_RSS_ENABLED: "true"',
    );
    expect(workflow).toContain(
      'cron: "*/15 * * * *"',
    );
    expect(workflow).toContain(
      "aljazeera_rss",
    );
    expect(workflow).toContain(
      "federal_reserve_press_rss",
    );
    expect(workflow).toContain(
      "forexlive_rss",
    );
    expect(workflow).toContain(
      "usgs_minerals_news_rss",
    );
  });
});
