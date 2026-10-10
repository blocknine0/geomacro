import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createPerKeySingleFlight } from "../lib/b2-single-flight";

describe("#1827 B2 class-B concurrent read coalescing", () => {
  it("shares one promise and one GET for many same-key readers", async () => {
    const run = createPerKeySingleFlight<string, number>();
    let resolve!: (x: number) => void;
    const deferred = new Promise<number>(r => { resolve = r; });
    const get = vi.fn(() => deferred);
    const tasks = Array.from({ length: 50 }, () => run("public-live/one", get));
    await Promise.resolve();
    expect(get).toHaveBeenCalledTimes(1);
    resolve(42);
    expect(await Promise.all(tasks)).toEqual(Array(50).fill(42));
    expect(get).toHaveBeenCalledTimes(1);
    expect(await run("public-live/one", async () => 99)).toBe(99);
  });

  it("does not coalesce different product keys", async () => {
    const run = createPerKeySingleFlight<string, string>();
    const tasks = [run("intel", async () => "a"), run("global-risk", async () => "b")];
    expect(await Promise.all(tasks)).toEqual(["a", "b"]);
  });

  it("never retains errors or negative B2 results beyond the in-flight window", async () => {
    const run = createPerKeySingleFlight<string, number | null>();
    const failure = vi.fn(async () => { throw new Error("upstream fail"); });
    await expect(run("x", failure)).rejects.toThrow("upstream fail");
    await expect(run("x", failure)).rejects.toThrow("upstream fail");
    expect(failure).toHaveBeenCalledTimes(2);
    const missing = vi.fn(async () => null);
    expect(await run("y", missing)).toBeNull();
    expect(await run("y", missing)).toBeNull();
    expect(missing).toHaveBeenCalledTimes(2);
  });

  it("continues to require existing signed B2 checks, bounded positive cache and fail-closed circuit", () => {
    const source = readFileSync("src/lib/b2-live.server.ts", "utf8");
    expect(source).toContain("shareSignedB2Read(key, () => signedGetOnce(key))");
    expect(source).toContain("if (!cfg || !allowedKey(key) || circuitOpen()) return null");
    expect(source).toContain("cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, bytes })");
    expect(source).toContain('Authorization: `AWS4-HMAC-SHA256');
    expect(source).toContain("if (!bytes.length || bytes.length > MAX_COMPRESSED_BYTES)");
  });
});
