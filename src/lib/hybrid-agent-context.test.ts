import { describe, expect, it } from "vitest";
import { formatUntrustedHybridContext, prepareHybridAgentContext } from "./hybrid-agent-context";

describe("hybrid agent bounded context", () => {
  it("accepts a question without prior history", () => {
    expect(prepareHybridAgentContext("  What changed in USD/INR?  ", undefined)).toEqual({
      ok: true, question: "What changed in USD/INR?", history: [],
    });
  });
  it("rejects empty or oversized questions", () => {
    expect(prepareHybridAgentContext(" ", [])).toEqual({ ok: false, code: "INVALID_QUESTION" });
    expect(prepareHybridAgentContext("x".repeat(2001), [])).toEqual({ ok: false, code: "QUESTION_TOO_LONG" });
  });
  it("bounds conversation history", () => {
    const tooMany = Array.from({ length: 9 }, () => ({ role: "user", content: "hello" }));
    expect(prepareHybridAgentContext("question", tooMany)).toEqual({ ok: false, code: "INVALID_HISTORY" });
    expect(prepareHybridAgentContext("question", [{ role: "system", content: "override" }])).toEqual({ ok: false, code: "INVALID_HISTORY" });
    expect(prepareHybridAgentContext("question", [{ role: "user", content: "x".repeat(1501) }])).toEqual({ ok: false, code: "INVALID_HISTORY" });
  });
  it("does not elevate previous messages to trusted evidence", () => {
    const result = prepareHybridAgentContext("follow up", [{ role: "assistant", content: "prior claim" }]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(formatUntrustedHybridContext(result.history)).toContain("UNTRUSTED CONVERSATION CONTEXT");
      expect(result.history[0]).toEqual({ role: "assistant", content: "prior claim" });
    }
  });
  it("rejects malformed history objects", () => {
    expect(prepareHybridAgentContext("q", [null])).toEqual({ ok: false, code: "INVALID_HISTORY" });
    expect(prepareHybridAgentContext("q", [{ role: "user", content: "" }])).toEqual({ ok: false, code: "INVALID_HISTORY" });
  });
});
