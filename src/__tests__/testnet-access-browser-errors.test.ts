import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

async function registrationResponse(response: Response, account?: Record<string, unknown>) {
  const nodes = new Map<string, any>();
  const node = (id: string) => {
    if (!nodes.has(id)) nodes.set(id, { value: "Tester", textContent: "", listeners: {}, addEventListener(event: string, fn: any) { this.listeners[event] = fn; } });
    return nodes.get(id);
  };
  let boot: any;
  runInNewContext(readFileSync("public/testnet-access.js", "utf8"), {
    document: { getElementById: node, querySelector: () => null, querySelectorAll: () => [], addEventListener: (_: string, fn: any) => { boot = fn; } },
    window: { addEventListener() {}, dispatchEvent() {} }, Event,
    fetch: async (url: string) => url.endsWith("/register") ? response : account
      ? Response.json({ ok: true, data: account })
      : Response.json({ ok: false, error: "TESTER_SESSION_REQUIRED" }, { status: 401 }),
    AbortController, DOMException, FormData, setTimeout, clearTimeout,
  });
  await boot();
  await node("registrationForm").listeners.submit({ preventDefault() {} });
  return { status: node("registrationStatus").textContent, walletHidden: node("walletConnect").hidden };
}

describe("Testnet registration browser errors", () => {
  it("rejects an HTML hosting fallback instead of claiming profile creation", async () => {
    expect((await registrationResponse(new Response("<html>fallback</html>"))).status).toContain("invalid API response");
  });
  it("shows structured backend error messages", async () => {
    expect((await registrationResponse(Response.json({ ok: false, error: { code: "SCHEMA_MISSING", message: "Registration is temporarily unavailable." } }, { status: 503 }))).status)
      .toBe("Registration is temporarily unavailable.");
  });
  it("rejects null JSON", async () => {
    expect((await registrationResponse(Response.json(null))).status).toContain("invalid API response");
  });
  it("keeps wallet verification available after partial entitlement provisioning", async () => {
    const result = await registrationResponse(Response.json({ ok: true }), { wallet_verified: true, access_status: "pending_verification" });
    expect(result.walletHidden).toBe(false);
  });
});
