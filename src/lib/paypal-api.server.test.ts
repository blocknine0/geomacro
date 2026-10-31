import { afterEach, describe, expect, it, vi } from "vitest";
import {
  configuredPayPal, paypalPublicConnectionStatus, paypalAccessToken,
  verifyPayPalWebhook, GEOMACRO_PAYPAL_FUNDS_CAPTURE_ENABLED,
} from "./paypal-api.server";
import { GEOMACRO_PAYPAL_PRODUCT_CATALOG, paypalCanCaptureFunds } from "./paypal-checkout-readiness";

const original = { ...process.env };
afterEach(() => { process.env = { ...original }; vi.restoreAllMocks(); });

describe("GeoMacro PayPal India cross-border readiness (NO FUNDS)", () => {
  it("does not expose live checkout or imply USDC payout when credentials exist", () => {
    process.env.GEOMACRO_PAYPAL_ENVIRONMENT = "live";
    process.env.GEOMACRO_PAYPAL_CLIENT_ID = "client-test";
    process.env.GEOMACRO_PAYPAL_CLIENT_SECRET = "sensitive-secret";
    process.env.GEOMACRO_PAYPAL_WEBHOOK_ID = "WH-test";
    const status = paypalPublicConnectionStatus();
    expect(status.credentials_present).toBe(true);
    expect(status.webhook_id_present).toBe(true);
    expect(status.active_checkout_enabled).toBe(false);
    expect(status.merchant_receives_usdc).toBe(false);
    expect(status.india_domestic_payments_supported).toBe(false);
    expect(status.stripe_checkout_enabled).toBe(false);
    expect(JSON.stringify(status)).not.toContain("sensitive-secret");
    expect(GEOMACRO_PAYPAL_FUNDS_CAPTURE_ENABLED).toBe(false);
    expect(paypalCanCaptureFunds()).toBe(false);
  });
  it("maps exactly the founder-approved prices without activation", () => {
    expect(GEOMACRO_PAYPAL_PRODUCT_CATALOG.map(x => [x.amount_usd, x.credits]))
      .toEqual([[9,1000],[29,5000],[99,25000],[5,100],[15,500],[30,1500]]);
    expect(GEOMACRO_PAYPAL_PRODUCT_CATALOG.every(x => !x.checkout_enabled)).toBe(true);
  });
  it("uses sandbox by default and refuses incomplete credentials", () => {
    delete process.env.GEOMACRO_PAYPAL_CLIENT_ID;
    delete process.env.GEOMACRO_PAYPAL_CLIENT_SECRET;
    delete process.env.GEOMACRO_PAYPAL_WEBHOOK_ID;
    process.env.GEOMACRO_PAYPAL_ENVIRONMENT = "live";
    expect(configuredPayPal()).toBeNull();
    process.env.GEOMACRO_PAYPAL_ENVIRONMENT = "something-else";
    expect(paypalPublicConnectionStatus().environment).toBe("sandbox");
  });
  it("PayPal OAuth uses Workerd-supported manual redirects without following them", async () => {
    const config = { environment: "sandbox" as const,
      baseUrl: "https://api-m.sandbox.paypal.com", clientId: "client-test",
      clientSecret: "opaque-secret", webhookId: "WH-test" };
    const calls: RequestInit[] = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://api-m.sandbox.paypal.com/v1/oauth2/token");
      expect(init?.method).toBe("POST");
      expect(init?.redirect).toBe("manual");
      if (init?.redirect === "error") throw new TypeError("workerd does not support redirect:error");
      calls.push(init!);
      return Response.json({ access_token: "sandbox-access-token" });
    }) as typeof fetch;
    expect(await paypalAccessToken(config, fakeFetch)).toBe("sandbox-access-token");
    expect(calls).toHaveLength(1);
  });
  it("PayPal OAuth and webhook verification reject 3xx without following an untrusted redirect", async () => {
    const config = { environment: "sandbox" as const,
      baseUrl: "https://api-m.sandbox.paypal.com", clientId: "client",
      clientSecret: "opaque-secret", webhookId: "WH-1" };
    let followed = 0;
    const redirect = (async (_url: string, init?: RequestInit) => {
      expect(init?.redirect).toBe("manual");
      followed++;
      return new Response(null, { status: 302,
        headers: { Location: "https://attacker.example/collect" } });
    }) as typeof fetch;
    await expect(paypalAccessToken(config, redirect))
      .rejects.toThrow("PAYPAL_PROVIDER_REDIRECT_REJECTED");
    expect(followed).toBe(1);
    const ts = "2026-10-31T10:00:00Z";
    const headers = new Headers({
      "paypal-transmission-time": ts, "paypal-transmission-id": "tx",
      "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT",
      "paypal-auth-algo": "SHA256withRSA", "paypal-transmission-sig": "sig",
    });
    let callCount = 0;
    const redirectVerification = (async (_url: string, init?: RequestInit) => {
      expect(init?.redirect).toBe("manual");
      callCount++;
      return callCount === 1 ?
        Response.json({ access_token: "sandbox-token" }) :
        new Response(null, {status:307,
          headers:{Location:"https://attacker.example/redirect"}});
    }) as typeof fetch;
    await expect(verifyPayPalWebhook({
      config,headers,rawBody:JSON.stringify({id:"evt",event_type:"PAYMENT.CAPTURE.COMPLETED"}),
      fetcher:redirectVerification,now:Date.parse(ts)
    })).rejects.toThrow("PAYPAL_PROVIDER_REDIRECT_REJECTED");
    expect(callCount).toBe(2);
  });
  it("verifies PayPal event signatures server-side, never provisions credits", async () => {
    const config = { environment: "sandbox" as const,
      baseUrl: "https://api-m.sandbox.paypal.com", clientId: "client",
      clientSecret: "secret", webhookId: "WH-1" };
    const now = Date.parse("2026-10-31T10:00:00.000Z");
    const headers = new Headers({
      "paypal-transmission-time": "2026-10-31T10:00:00.000Z",
      "paypal-transmission-id": "trans-1",
      "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1",
      "paypal-auth-algo": "SHA256withRSA",
      "paypal-transmission-sig": "signature",
    });
    const fakeFetch = vi.fn(async (url: string) =>
      new Response(JSON.stringify(url.endsWith("/token")
        ? { access_token: "test-token" }
        : { verification_status: "SUCCESS" }), { status: 200 }),
    ) as unknown as typeof fetch;
    const event = { id: "WH-event-1", event_type: "PAYMENT.CAPTURE.COMPLETED" };
    const proof = await verifyPayPalWebhook({
      rawBody: JSON.stringify(event), headers, config, fetcher: fakeFetch, now,
    });
    expect(proof).toEqual({ verified: true, eventId: "WH-event-1", eventType: "PAYMENT.CAPTURE.COMPLETED" });
    expect(fakeFetch).toHaveBeenCalledTimes(2);
    expect(fakeFetch).toHaveBeenCalledWith(
      "https://api-m.sandbox.paypal.com/v1/oauth2/token", expect.any(Object),
    );
    expect(fakeFetch).toHaveBeenCalledWith(
      "https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature",
      expect.objectContaining({ method: "POST" }),
    );
    headers.set("paypal-transmission-time","2026-10-31T08:00:00.000Z");
    await expect(verifyPayPalWebhook({
      rawBody: JSON.stringify(event), headers, config, fetcher: fakeFetch, now,
    })).rejects.toThrow("PAYPAL_WEBHOOK_TIMESTAMP_STALE");
    expect(fakeFetch).toHaveBeenCalledTimes(2);
  });
  it("rejects PayPal verification failure", async () => {
    const cfg = { environment: "sandbox" as const, baseUrl: "https://api-m.sandbox.paypal.com",
      clientId: "client", clientSecret: "secret", webhookId: "WH-1" };
    const headers = new Headers({
      "paypal-transmission-time": "2026-10-31T10:00:00Z",
      "paypal-transmission-id": "trans-1",
      "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-1",
      "paypal-auth-algo": "SHA256withRSA",
      "paypal-transmission-sig": "signature",
    });
    const fakeFetch = vi.fn(async (url: string) => new Response(JSON.stringify(
      url.includes("oauth") ? { access_token: "token" } : { verification_status: "FAILURE" },
    ), { status: 200 })) as unknown as typeof fetch;
    await expect(verifyPayPalWebhook({ rawBody: JSON.stringify({
      id: "WH-123", event_type: "PAYMENT.CAPTURE.COMPLETED",
    }), headers, config: cfg, fetcher: fakeFetch, now: Date.parse("2026-10-31T10:00:00Z") }))
      .rejects.toThrow("PAYPAL_WEBHOOK_SIGNATURE_INVALID");
  });
});
