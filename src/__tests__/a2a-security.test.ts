import { describe, expect, it } from "vitest";

import {
  isBlockedA2AAddress,
  validateA2AEndpointUrl,
} from "../lib/a2a-security.server";

describe("A2A SSRF boundary", () => {
  const allowed = new Set(["https://partner.example"]);

  it("accepts only exact allowlisted HTTPS origins", () => {
    expect(validateA2AEndpointUrl("https://partner.example/callback", allowed).origin).toBe(
      "https://partner.example",
    );
    expect(() => validateA2AEndpointUrl("http://partner.example/callback", allowed)).toThrow(
      "A2A_HTTPS_REQUIRED",
    );
    expect(() => validateA2AEndpointUrl("https://other.example/callback", allowed)).toThrow(
      "A2A_ORIGIN_NOT_ALLOWLISTED",
    );
  });

  it("rejects embedded credentials, local hosts and nonstandard ports", () => {
    expect(() => validateA2AEndpointUrl("https://user:pass@partner.example/callback", allowed)).toThrow();
    expect(() => validateA2AEndpointUrl("https://partner.example:8443/callback", allowed)).toThrow();
    expect(() => validateA2AEndpointUrl("https://localhost/callback", new Set(["https://localhost"]))).toThrow();
  });

  it("classifies private, loopback, link-local and multicast IPs as blocked", () => {
    for (const address of [
      "127.0.0.1",
      "10.0.0.1",
      "172.16.1.1",
      "192.168.1.1",
      "169.254.169.254",
      "224.0.0.1",
      "::1",
      "fc00::1",
      "fe80::1",
      "ff02::1",
    ]) {
      expect(isBlockedA2AAddress(address)).toBe(true);
    }
    expect(isBlockedA2AAddress("8.8.8.8")).toBe(false);
    expect(isBlockedA2AAddress("2606:4700:4700::1111")).toBe(false);
  });
});
