import { describe, expect, it } from "vitest";
import { pinnedRiskObjectVerificationKeys } from "../lib/risk-object-public-registry";
import { parsePinnedPublicRiskObjectRegistry } from "../lib/d1-country-gro-hot.server";

function publicResponse() {
  const pinned = pinnedRiskObjectVerificationKeys();
  return {
    ok: true,
    keys: Object.entries(pinned).map(([key_id, value]) => {
      if (typeof value === "string") throw new Error("Canonical pins require lifecycle");
      return { key_id, ...value };
    }),
  };
}

describe("#1827 public GRO trust-registry canonical pinning", () => {
  it("admits only an exact current canonical public registry, without private keys", () => {
    const registry = publicResponse();
    expect(parsePinnedPublicRiskObjectRegistry(registry)).toEqual(
      pinnedRiskObjectVerificationKeys(),
    );
  });

  it("rejects injected active signer and omitted current pins", () => {
    const original = publicResponse();
    const rogue = {
      key_id: "attacker-active",
      public_key_spki_b64: original.keys[0].public_key_spki_b64,
      status: "active",
      not_before: null,
      not_after: null,
    };
    expect(parsePinnedPublicRiskObjectRegistry({ ...original, keys: [...original.keys, rogue] })).toBeNull();
    expect(parsePinnedPublicRiskObjectRegistry({ ...original, keys: [original.keys[0]] })).toBeNull();
    expect(parsePinnedPublicRiskObjectRegistry({ ...original, keys: [...original.keys, original.keys[0]] })).toBeNull();
  });

  it("fails closed on key replacement, status mutation, or altered validity window", () => {
    const original = publicResponse();
    for (const bad of [
      { ...original.keys[0], public_key_spki_b64: "MCowBQYDK2VwAyEA" },
      { ...original.keys[0], status: original.keys[0].status === "active" ? "revoked" : "active" },
      { ...original.keys[0], not_before: "2026-10-10T00:00:00Z" },
      { ...original.keys[0], not_after: "2026-10-10T00:00:00Z" },
    ]) {
      expect(parsePinnedPublicRiskObjectRegistry({ ...original, keys: [bad, ...original.keys.slice(1)] })).toBeNull();
    }
  });

  it("blocks forged objects, unsafe prototype keys, malformed responses and unbounded registries", () => {
    const original = publicResponse();
    const malicious = ["__proto__", "constructor", "prototype"];
    for (const key_id of malicious) {
      expect(parsePinnedPublicRiskObjectRegistry({
        ...original, keys: [{ ...original.keys[0], key_id }, ...original.keys.slice(1)],
      })).toBeNull();
    }
    expect(parsePinnedPublicRiskObjectRegistry({ ok: false, keys: original.keys })).toBeNull();
    expect(parsePinnedPublicRiskObjectRegistry(null)).toBeNull();
    expect(parsePinnedPublicRiskObjectRegistry({ ok: true, keys: [] })).toBeNull();
    expect(parsePinnedPublicRiskObjectRegistry({ ok: true, keys: new Array(17).fill(original.keys[0]) })).toBeNull();
    expect(parsePinnedPublicRiskObjectRegistry({ ok: true, keys: [{}] })).toBeNull();
    expect(parsePinnedPublicRiskObjectRegistry({
      ...original, keys: [{ ...original.keys[0], status: "pending" }, ...original.keys.slice(1)],
    })).toBeNull();
  });
});
