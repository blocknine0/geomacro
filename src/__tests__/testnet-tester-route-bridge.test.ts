import { describe, expect, it } from "vitest";

import { runH3Handler } from "../lib/testnet-h3-bridge";

describe("testnet h3 route bridge", () => {
  it("passes through string bodies, status and headers from the existing handler", async () => {
    const handler = (event: any) => {
      event.res.headers.set("content-type", "text/html; charset=utf-8");
      event.res.headers.set("cache-control", "no-store");
      return "<!doctype html><html></html>";
    };

    const response = await runH3Handler(new Request("http://localhost/testnet-access"), handler);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toContain("<!doctype html>");
  });

  it("serializes object payloads as JSON", async () => {
    const response = await runH3Handler(new Request("http://localhost/api/testnet-tester/me"), () => ({
      ok: true,
      data: { verified: false },
    }));

    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ ok: true, data: { verified: false } });
  });

  it("maps thrown h3 errors to fail-closed JSON responses", async () => {
    const response = await runH3Handler(new Request("http://localhost/api/testnet-tester/config"), () => {
      throw Object.assign(new Error("TESTER_AUTH_REQUIRED"), {
        statusCode: 401,
        statusMessage: "TESTER_AUTH_REQUIRED",
      });
    });

    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload.ok).toBe(false);
    expect(payload.error).toBe("TESTER_AUTH_REQUIRED");
    expect(payload.execution_authorized).toBe(false);
  });

  it("injects router params for dynamic handlers", async () => {
    const response = await runH3Handler(
      new Request("http://localhost/api/testnet-tester/share-card/abc"),
      (event: any) => ({ slug: event.context.params.slug }),
      { slug: "abc" },
    );

    expect(await response.json()).toEqual({ slug: "abc" });
  });
});