import { beforeEach, describe, expect, it } from "vitest";

import {
  acquireTestnetPublicSlot,
  checkTestnetPublicRateLimit,
  resetTestnetPublicProtectionForTests,
  TESTNET_PUBLIC_PROTECTION_POLICY,
} from "@/lib/testnet-public-protection.server";
import {
  TESTNET_PUBLIC_API_KEYS,
  testnetPublicAccessByApiKey,
} from "@/lib/testnet-public-access-contract";

describe("Testnet public access protection", () => {
  beforeEach(() => {
    resetTestnetPublicProtectionForTests();
  });

  it("resolves three unique network-specific public keys", () => {
    const entries = Object.values(TESTNET_PUBLIC_API_KEYS);
    expect(entries).toHaveLength(3);
    expect(new Set(entries.map((entry) => entry.public_api_key)).size).toBe(3);
    for (const entry of entries) {
      expect(testnetPublicAccessByApiKey(entry.public_api_key)?.chain_key).toBe(entry.chain_key);
    }
  });

  it("rate-limits one abusive principal without throwing under 50k hits", () => {
    const key = TESTNET_PUBLIC_API_KEYS.arcTestnet.public_api_key;
    let allowed = 0;
    let rejected = 0;
    const now = 1_700_000_000_000;

    for (let index = 0; index < 50_000; index += 1) {
      const result = checkTestnetPublicRateLimit({
        principalId: "principal-abusive",
        publicApiKey: key,
        now,
      });
      if (result.allowed) allowed += 1;
      else rejected += 1;
    }

    expect(allowed).toBe(TESTNET_PUBLIC_PROTECTION_POLICY.max_requests_per_principal_per_public_key);
    expect(rejected).toBe(50_000 - allowed);
  });

  it("keeps independent rate buckets for the three public Testnets", () => {
    const now = 1_700_000_000_000;
    for (const entry of Object.values(TESTNET_PUBLIC_API_KEYS)) {
      let allowed = 0;
      for (let index = 0; index < 40; index += 1) {
        if (checkTestnetPublicRateLimit({ principalId: "same-principal", publicApiKey: entry.public_api_key, now }).allowed) {
          allowed += 1;
        }
      }
      expect(allowed).toBe(TESTNET_PUBLIC_PROTECTION_POLICY.max_requests_per_principal_per_public_key);
    }
  });

  it("applies concurrency backpressure and recovers after slots are released", () => {
    const key = TESTNET_PUBLIC_API_KEYS.baseSepolia.public_api_key;
    const releases: Array<() => void> = [];

    for (let index = 0; index < TESTNET_PUBLIC_PROTECTION_POLICY.max_active_per_principal; index += 1) {
      const release = acquireTestnetPublicSlot({ principalId: "principal-1", publicApiKey: key });
      expect(release).toBeTypeOf("function");
      releases.push(release!);
    }

    expect(acquireTestnetPublicSlot({ principalId: "principal-1", publicApiKey: key })).toBeNull();
    releases[0]();
    const recovered = acquireTestnetPublicSlot({ principalId: "principal-1", publicApiKey: key });
    expect(recovered).toBeTypeOf("function");
    recovered?.();
    for (const release of releases.slice(1)) release();
  });
});
