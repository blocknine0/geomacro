import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("permanent zero-advisory dependency hardening", () => {
  const manifest = JSON.parse(read("package.json"));
  const lock = read("bun.lock");
  const vite = read("vite.config.ts");
  const gate = read(".github/workflows/security-resilience-gate.yml");

  it("removes both unused Circle App Kit entrypoints but preserves real x402 batching", () => {
    expect(manifest.dependencies["@circle-fin/app-kit"]).toBeUndefined();
    expect(manifest.dependencies["@circle-fin/adapter-ethers-v6"]).toBeUndefined();
    expect(manifest.dependencies["@circle-fin/x402-batching"]).toBe("3.4.0");
    expect(manifest.dependencies.ethers).toBe("^6.17.0");
  });

  it("removes both expired cryptographic dependency entries from the frozen lock", () => {
    expect(lock).not.toContain('    "elliptic": [');
    expect(lock).not.toContain('    "@ethersproject/signing-key": [');
    expect(lock).not.toContain('    "@circle-fin/app-kit": [');
    expect(lock).not.toContain('    "@circle-fin/adapter-ethers-v6": [');
    expect(lock).toContain('    "@circle-fin/x402-batching": [');
  });

  it("does not retain a phantom Solana websocket module path in the Vite graph", () => {
    expect(vite).not.toContain("rpc-websockets");
    expect(vite).toContain("lovable-node-polyfill-resolver");
  });

  it("requires bun audit success with no time-bound exception or crypto bypass", () => {
    expect(gate).toContain('if [[ "$audit_code" -ne 0 ]]');
    expect(gate).toContain("Any known dependency advisory or audit failure is a release blocker");
    expect(gate).not.toContain("Dependency exception expired");
    expect(gate).not.toContain("PASS with bounded exception");
  });
});
