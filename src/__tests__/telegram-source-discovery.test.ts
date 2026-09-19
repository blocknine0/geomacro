import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

describe("Telegram automated public source discovery contract", () => {
  it("uses Telegram's global channel search path and public-channel filtering", () => {
    const source = fs.readFileSync(
      path.join(root, "workers/telegram-flash/discover.py"),
      "utf8",
    );

    expect(source).toContain("SearchGlobalRequest");
    expect(source).toContain("broadcasts_only=True");
    expect(source).toContain("public_channel");
    expect(source).toContain("UNVERIFIED_OWNERSHIP");
    expect(source).toContain("INTERNAL_RESEARCH_ONLY");
    expect(source).toContain("auto_admission_status");
  });

  it("is scheduled and scans the canonical 194-country registry", () => {
    const workflow = fs.readFileSync(
      path.join(root, ".github/workflows/telegram-source-discovery.yml"),
      "utf8",
    );

    expect(workflow).toContain('cron: "17 */6 * * *"');
    expect(workflow).toContain("TELEGRAM_DISCOVERY_COUNTRIES_PER_RUN: \"194\"");
    expect(workflow).toContain("workers/telegram-flash/discover.py");
  });
});
