import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";

import {
  assertRiskObjectJsonKeysSafe,
  canonicalRiskObjectJson,
} from "../lib/risk-object-signing.server";

describe("Risk Object __proto__ canonicalization hardening", () => {
  it("keeps an own __proto__ member inside canonical signed bytes", () => {
    const withProto = JSON.parse(
      '{"id":"x","evidence":{"__proto__":{"injected":"not signed"},"source":"rss"}}',
    );
    const withoutProto = JSON.parse(
      '{"id":"x","evidence":{"source":"rss"}}',
    );

    const canonicalWithProto = canonicalRiskObjectJson(withProto);
    const canonicalWithoutProto = canonicalRiskObjectJson(withoutProto);

    expect(canonicalWithProto).toContain('"__proto__":{"injected":"not signed"}');
    expect(canonicalWithProto).not.toBe(canonicalWithoutProto);
    expect(
      createHash("sha256").update(canonicalWithProto, "utf8").digest("hex"),
    ).not.toBe(
      createHash("sha256").update(canonicalWithoutProto, "utf8").digest("hex"),
    );
  });

  it("rejects __proto__ at the Risk Object trust boundary", () => {
    const payload = JSON.parse(
      '{"id":"x","evidence":{"__proto__":{"injected":true},"source":"rss"}}',
    );

    expect(() => assertRiskObjectJsonKeysSafe(payload)).toThrow(
      "Risk Object JSON contains forbidden __proto__ key",
    );
  });

  it("does not reject a literal proto key", () => {
    const payload = JSON.parse(
      '{"id":"x","evidence":{"proto":{"safe":true},"source":"rss"}}',
    );

    expect(() => assertRiskObjectJsonKeysSafe(payload)).not.toThrow();
  });
});
