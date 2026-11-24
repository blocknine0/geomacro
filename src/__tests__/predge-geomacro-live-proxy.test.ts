import { describe, expect, it } from "vitest";
import { forwardPredgePaidRiskGate, PREDGE_DECISION_SUPPORT_NOTICE } from "../routes/v2.partner.predge.paid-risk-gate";
import { forwardCommercialPublicKey } from "../routes/v1.risk-stream.commercial-public-key";
import { forwardDirectRiskGate } from "../routes/api.v1.risk-gate";

describe("geomacro.live Predge paid proxy and decision support notice", () => {
  it("forwards auth/predge headers, preserves X-GeoMacro-* headers, and adds decision_support_notice", async () => {
    let seenHeaders: Headers | undefined;
    const res = await forwardPredgePaidRiskGate(
      new Request("https://geomacro.live/v2/partner/predge/paid-risk-gate", {
        method: "POST",
        headers: {
          authorization: "Bearer test-token",
          "content-type": "application/json",
          "x-predge-end-buyer-id": "buyer-1",
        },
        body: JSON.stringify({ country_iso3: "USA" }),
      }),
      async (_url, init) => {
        seenHeaders = new Headers(init?.headers);
        return new Response(JSON.stringify({ ok: true, execution_authorized: false }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-geomacro-publisher": "https://geomacro.live",
          },
        });
      },
    );
    expect(res.status).toBe(200);
    expect(seenHeaders?.get("authorization")).toBe("Bearer test-token");
    expect(seenHeaders?.get("x-predge-end-buyer-id")).toBe("buyer-1");
    expect(res.headers.get("x-geomacro-publisher")).toBe("https://geomacro.live");
    const json = await res.json();
    expect(json.decision_support_notice).toBe(PREDGE_DECISION_SUPPORT_NOTICE);
  });

  it("includes decision_support_notice on /api/v1/risk-gate prepare and error responses", async () => {
    const prep = await forwardDirectRiskGate(
      new Request("https://geomacro.live/api/v1/risk-gate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "prepare", category: "GEOPOLITICS", country_iso3: "USA", tier: "BASIC" }),
      }),
    );
    expect(prep.status).toBe(200);
    expect((await prep.json()).decision_support_notice).toBe(PREDGE_DECISION_SUPPORT_NOTICE);
  });

  it("proxies /v1/risk-stream/commercial-public-key GET responses", async () => {
    const res = await forwardCommercialPublicKey(async () =>
      new Response(JSON.stringify({ ok: true, scheme: "Ed25519" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).scheme).toBe("Ed25519");
  });
});
