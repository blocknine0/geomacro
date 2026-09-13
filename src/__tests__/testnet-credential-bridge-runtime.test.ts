import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const script = readFileSync("public/testnet-console-pricing.js", "utf8");
const apiKey = `gmk_test_${"k".repeat(24)}`;
const apiSecret = `gms_test_${"s".repeat(40)}`;
const grantId = "grant-runtime-one";
const requestId = "runtime-request-0001";
const fingerprint = "a".repeat(64);

async function harness(options: { response?: Response; credential?: boolean } = {}) {
  const calls: Array<{ url: string; init: any }> = [];
  const nodes: any[] = [];
  const listeners: Record<string, any> = {};

  function element(tag: string) {
    const node: any = {
      tag,
      id: "",
      value: "",
      textContent: "",
      className: "",
      children: [],
      listeners: {},
      disabled: false,
      appendChild(child: any) { this.children.push(child); child.parentNode = this; },
      append(...children: any[]) { children.forEach((child) => this.appendChild(child)); },
      addEventListener(name: string, listener: any) { this.listeners[name] = listener; },
    };
    nodes.push(node);
    return node;
  }

  const anchor = element("div");
  anchor.id = "consoleAnchor";

  const nativeFetch = vi.fn(async (input: string | Request, init: any = {}) => {
    const url = typeof input === "string" ? input : input.url;
    calls.push({ url, init });
    if (url === "/api/testnet-tester/me") {
      return Response.json({
        ok: true,
        data: { access_status: "active", entitlement_grant_id: grantId },
      });
    }
    if (url === "/api/testnet/account") {
      return Response.json({
        ok: true,
        data: {
          principal: { key_id: apiKey },
          entitlement: { grant_id: grantId, status: "active", tier: "testnet_tester" },
        },
      });
    }
    if (url === "/api/testnet/intelligence") {
      return (
        options.response ??
        Response.json(
          {
            ok: false,
            error: { code: "TESTNET_PAYMENT_REQUIRED" },
            payment: { amount_due_usdc: 0.5 },
            request_binding: {
              request_id: requestId,
              request_fingerprint_sha256: fingerprint,
            },
          },
          { status: 402 },
        )
      );
    }
    if (url === "/api/testnet-tester/config") {
      return Response.json({ ok: true, data: { capability_prices: {} } });
    }
    throw new Error(`Unexpected fetch ${url}`);
  });

  const windowObject: any = {
    fetch: nativeFetch,
    location: { href: "https://geomacro.live/testnet-console" },
  };
  const documentObject: any = {
    addEventListener: (name: string, listener: any) => {
      listeners[name] = listener;
    },
    getElementById: (id: string) => nodes.find((node) => node.id === id) ?? null,
    createElement: element,
  };
  const forbiddenStorage = {
    getItem() { throw new Error("Credential bridge must not read browser storage"); },
    setItem() { throw new Error("Credential bridge must not write browser storage"); },
    removeItem() { throw new Error("Credential bridge must not mutate browser storage"); },
  };

  runInNewContext(script, {
    window: windowObject,
    document: documentObject,
    sessionStorage: forbiddenStorage,
    localStorage: forbiddenStorage,
    Headers,
    Response,
    Request,
    URL,
    Date,
    JSON,
    console,
    setTimeout,
    clearTimeout,
  });

  await listeners.DOMContentLoaded?.();

  if (options.credential !== false) {
    const input = nodes.find((node) => node.id === "testerCredentialPair");
    const verify = nodes.find((node) => node.textContent === "Verify credential & continue");
    expect(input).toBeTruthy();
    expect(verify).toBeTruthy();
    input.value = `API Key: ${apiKey}\nAPI Secret: ${apiSecret}`;
    await verify.listeners.click();
  }

  return { windowObject, nativeFetch, calls, nodes, listeners };
}

function paidRequest() {
  return {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      request_id: requestId,
      capability: "gri_read",
      subject: { type: "global" },
    }),
  };
}

describe("Testnet developer credential browser bridge runtime", () => {
  it("keeps the verified Key + Secret in memory and rewrites the paid call to the developer API", async () => {
    const app = await harness();
    const response = await app.windowObject.fetch("/api/testnet-tester/intelligence", paidRequest());

    expect(response.status).toBe(402);
    const developerCall = app.calls.find((entry) => entry.url === "/api/testnet/intelligence");
    expect(developerCall).toBeTruthy();
    expect(new Headers(developerCall!.init.headers).get("authorization")).toBe(
      `GeomacroTest ${apiKey}.${apiSecret}`,
    );
    expect(developerCall!.init.body).toBe(paidRequest().body);
    expect(app.calls.some((entry) => entry.url === "/api/testnet/account")).toBe(true);
    expect(script).not.toContain("sessionStorage");
    expect(script).not.toContain("localStorage");
  });

  it("blocks the paid surface when no developer credential is loaded", async () => {
    const app = await harness({ credential: false });
    const response = await app.windowObject.fetch("/api/testnet-tester/intelligence", paidRequest());
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error.code).toBe("TESTNET_API_KEY_SECRET_REQUIRED");
    expect(app.calls.some((entry) => entry.url === "/api/testnet/intelligence")).toBe(false);
  });

  it("fails closed if a 402 quote is missing the exact request fingerprint", async () => {
    const app = await harness({
      response: Response.json(
        {
          ok: false,
          error: { code: "TESTNET_PAYMENT_REQUIRED" },
          payment: { amount_due_usdc: 0.5 },
          request_binding: { request_id: requestId },
        },
        { status: 402 },
      ),
    });
    const response = await app.windowObject.fetch("/api/testnet-tester/intelligence", paidRequest());
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe("TESTNET_REQUEST_BINDING_MISSING");
    expect(payload.error.message).toContain("No payment should be sent");
  });

  it("accepts a delivered result only when credential, entitlement and request binding all match", async () => {
    const app = await harness({
      response: Response.json({
        ok: true,
        principal: { key_id: apiKey },
        entitlement: { grant_id: grantId },
        request_binding: {
          request_id: requestId,
          request_fingerprint_sha256: fingerprint,
        },
        data: { display_score: 50 },
      }),
    });
    const response = await app.windowObject.fetch("/api/testnet-tester/intelligence", paidRequest());
    expect(response.status).toBe(200);
  });

  it("rejects a result bound to a different entitlement even if the HTTP response is 200", async () => {
    const app = await harness({
      response: Response.json({
        ok: true,
        principal: { key_id: apiKey },
        entitlement: { grant_id: "different-grant" },
        request_binding: {
          request_id: requestId,
          request_fingerprint_sha256: fingerprint,
        },
        data: {},
      }),
    });
    const response = await app.windowObject.fetch("/api/testnet-tester/intelligence", paidRequest());
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error.code).toBe("TESTNET_DELIVERY_BINDING_MISMATCH");
  });
});
