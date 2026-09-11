import { describe, expect, it } from "vitest";

import {
  RISK_SUPABASE_REQUEST_TIMEOUT_MS,
  createRiskSupabaseRequestSignal,
} from "../lib/risk-supabase.server";

function waitForAbort(signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

describe("privileged Risk Supabase request deadline", () => {
  it("keeps the production hard deadline at 15 seconds", () => {
    expect(RISK_SUPABASE_REQUEST_TIMEOUT_MS).toBe(15_000);
  });

  it("aborts a hanging request after the configured deadline", async () => {
    const signal = createRiskSupabaseRequestSignal(undefined, 10);
    await waitForAbort(signal);
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBeDefined();
  });

  it("preserves an upstream abort instead of waiting for the deadline", async () => {
    const upstream = new AbortController();
    const signal = createRiskSupabaseRequestSignal(upstream.signal, 5_000);
    upstream.abort(new Error("caller cancelled"));
    await waitForAbort(signal);
    expect(signal.aborted).toBe(true);
    expect(String(signal.reason)).toContain("caller cancelled");
  });

  it("rejects invalid timeout values", () => {
    expect(() => createRiskSupabaseRequestSignal(undefined, 0)).toThrow();
    expect(() => createRiskSupabaseRequestSignal(undefined, 60_001)).toThrow();
  });
});
