import { test, expect } from "@playwright/test";
import { appendFileSync } from "node:fs";

const BASE_URL = process.env.GEOMACRO_LIVE_URL ?? "https://geomacro.live";
const QUESTION =
  "What is currently changing in global rare-earth supply risk, especially around China, export controls, and downstream supply chains?";

test.describe("Geomacro live Ask acceptance", () => {
  test("executes a real Rare Earth question and captures the production response", async ({ page }) => {
    await page.goto(`${BASE_URL}/ask-geomacro`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });

    const input = page.locator("#ask-geomacro-input");
    await expect(input).toBeVisible({ timeout: 15_000 });

    await input.fill(QUESTION);
    await page.getByRole("button", { name: "Ask", exact: true }).click();

    const answerStatus = page.locator('[role="status"]');
    await expect(answerStatus).toContainText("Geomacro answer", { timeout: 60_000 });

    const answerText = (await answerStatus.innerText()).trim();
    const evidence = await answerStatus.locator('a[href^="http"]').evaluateAll((links) =>
      links
        .map((link) => ({
          title: (link.textContent ?? "").trim(),
          href: (link as HTMLAnchorElement).href,
        }))
        .filter((item) => item.title && item.href),
    );

    expect(answerText).not.toContain("No strongly relevant stored evidence is available for this question.");
    expect(answerText).not.toContain("Research unavailable");
    expect(evidence.length).toBeGreaterThan(0);

    const summary = [
      "## Live Ask Geomacro acceptance",
      "",
      `**Question:** ${QUESTION}`,
      "",
      "### Captured production response",
      "",
      answerText,
      "",
      "### Returned evidence",
      "",
      ...evidence.map((item) => `- [${item.title}](${item.href})`),
      "",
      `**Live URL:** ${BASE_URL}/ask-geomacro`,
      `**Executed at:** ${new Date().toISOString()}`,
      "",
    ].join("\n");

    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
    }

    console.log("\n=== GEOMACRO LIVE ASK ANSWER BEGIN ===");
    console.log(answerText);
    console.log("=== GEOMACRO LIVE ASK ANSWER END ===");
    console.log("\n=== GEOMACRO LIVE ASK EVIDENCE BEGIN ===");
    console.log(JSON.stringify(evidence, null, 2));
    console.log("=== GEOMACRO LIVE ASK EVIDENCE END ===");
  });
});
