import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const browser = read("public/testnet-access.js");
const page = read("server/routes/testnet-access.get.ts");
const feedbackRoute = read("src/routes/api.demo.feedback.ts");

describe("Testnet tester feedback and bounded-browser contract", () => {
  it("time-locks browser API calls so the tester UI cannot hang forever", () => {
    expect(browser).toContain("TESTNET_REQUEST_TIMEOUT_MS = 30_000");
    expect(browser).toContain("controller.abort");
    expect(browser).toContain("Request timed out");
    expect(browser).toContain("clearTimeout(timeoutId)");
  });

  it("captures structured tester feedback through the privacy-minimized feedback endpoint", () => {
    expect(page).toContain('id="testerFeedbackForm"');
    expect(page).toContain('id="feedbackRating"');
    expect(page).toContain('id="feedbackOutcome"');
    expect(page).toContain('id="feedbackFriction"');
    expect(browser).toContain('json("/api/demo/feedback"');
    expect(browser).toContain('demo_mode: "OTHER"');
    expect(browser).toContain("submitTesterFeedback");
    expect(feedbackRoute).toContain("without your IP address or wallet address");
  });

  it("does not send wallet identity, API keys, transaction hashes or secrets in tester feedback", () => {
    const feedbackFunction = browser.slice(
      browser.indexOf("async function submitTesterFeedback"),
      browser.indexOf("async function loadDeveloperKeys"),
    );

    expect(feedbackFunction).not.toMatch(/walletAddress|api_key|txHash|private[_ -]?key|seed phrase/i);
    expect(feedbackFunction).toContain("tester_type");
    expect(feedbackFunction).toContain("rating");
    expect(feedbackFunction).toContain("outcome");
    expect(feedbackFunction).toContain("friction");
    expect(feedbackFunction).toContain("missing_capability");
  });
});
