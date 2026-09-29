import { describe, expect, it } from "vitest";
import {
  SupabaseCircuitBreaker,
  createSupabaseRequestSignal,
  isTransientSupabaseStatus,
} from "@/lib/supabase-circuit.server";

describe("Supabase outage isolation", () => {
  it("treats quota, throttling, timeout and provider errors as transient", () => {
    for (const status of [402, 408, 425, 429, 500, 502, 503, 504, 540, 544, 546, 599]) {
      expect(isTransientSupabaseStatus(status), String(status)).toBe(true);
    }
    for (const status of [200, 400, 401, 403, 404, 409, 422]) {
      expect(isTransientSupabaseStatus(status), String(status)).toBe(false);
    }
  });

  it("opens after three consecutive failures and allows one half-open probe", () => {
    const circuit = new SupabaseCircuitBreaker({ failureThreshold: 3, cooldownMs: 30_000 });
    expect(circuit.canRequest(1_000)).toBe(true);
    circuit.recordFailure(1_000);
    expect(circuit.canRequest(1_001)).toBe(true);
    circuit.recordFailure(1_001);
    expect(circuit.canRequest(1_002)).toBe(true);
    circuit.recordFailure(1_002);
    expect(circuit.canRequest(20_000)).toBe(false);
    expect(circuit.canRequest(31_001)).toBe(false);
    expect(circuit.canRequest(31_002)).toBe(true);
    expect(circuit.canRequest(31_003)).toBe(false);
    circuit.recordSuccess();
    expect(circuit.canRequest(31_004)).toBe(true);
  });

  it("resets provider failures after any reachable non-transient response", () => {
    const circuit = new SupabaseCircuitBreaker({ failureThreshold: 2, cooldownMs: 30_000 });
    circuit.recordFailure(1_000);
    circuit.recordReachableNonTransientResponse();
    expect(circuit.snapshot(1_001)).toEqual({ open: false, failures: 0, retryAfterSeconds: 0 });
  });

  it("keeps every network call on a bounded deadline", async () => {
    const signal = createSupabaseRequestSignal(undefined, 5);
    await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
    expect(signal.aborted).toBe(true);
    expect(() => createSupabaseRequestSignal(undefined, 0)).toThrow();
    expect(() => createSupabaseRequestSignal(undefined, 60_001)).toThrow();
  });
});
