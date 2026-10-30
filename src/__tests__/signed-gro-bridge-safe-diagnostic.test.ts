import { afterEach, describe, expect, it, vi } from "vitest";
import { readD1VerifiedHotCountryGro } from "../lib/d1-country-gro-hot.server";

const AT = "2026-10-31T01:00:00.000Z";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function probe() {
  const codes: string[] = [];
  const result = await readD1VerifiedHotCountryGro("USA", AT, code => { codes.push(code); });
  return { result, codes };
}

describe("protected signed GRO bridge root diagnosis", () => {
  it("rejects a missing control-plane root without even making a request", async () => {
    vi.stubEnv("GEOMACRO_COMMERCE_LEDGER_TOKEN", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await probe()).toEqual({ result: null, codes: ["AUTH_ROOT_UNAVAILABLE"] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [401, "CONTROL_PLANE_HTTP_401"], [403, "CONTROL_PLANE_HTTP_403"],
    [404, "CONTROL_PLANE_HTTP_404"], [503, "CONTROL_PLANE_HTTP_503"],
  ])("attributes actual Worker HTTP %i without another fetch or leaking body", async (http, reason) => {
    vi.stubEnv("GEOMACRO_COMMERCE_LEDGER_TOKEN", "a".repeat(64));
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response("private-redacted", { status:http }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await probe()).toEqual({ result: null, codes: [reason] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0] as URL;
    expect(url.pathname).toBe("/v1/country-gro-hot/USA");
  });

  it("distinguishes an absent hot object from transport/auth failures", async () => {
    vi.stubEnv("GEOMACRO_COMMERCE_LEDGER_TOKEN", "a".repeat(64));
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, object: null }), { status:200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await probe()).toEqual({ result: null, codes: ["HOT_OBJECT_MISSING"] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("diagnoses expired but otherwise enveloped hot metadata before any public trust lookup", async () => {
    vi.stubEnv("GEOMACRO_COMMERCE_LEDGER_TOKEN", "a".repeat(64));
    const object = {
      subject: { type:"country", id:"USA" }, object_id:"private-opaque",
      integrity: { payload_hash:"abc", signing_key_id:"issuer" },
      generated_at:"2026-10-30T20:00:00Z", expires_at:"2026-10-30T23:00:00Z",
    };
    const body = { ok:true, serving_store:"cloudflare-d1", archive_store:"backblaze-b2",
      archive_write_acknowledged:true, archive_readback_required_for_serving:false,
      record_sha256:"a".repeat(64), archive_sha256:"b".repeat(64),
      object_id:object.object_id, payload_hash:"abc", signing_key_id:"issuer", object };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), {status:200}));
    vi.stubGlobal("fetch", fetchMock);
    expect(await probe()).toEqual({ result:null, codes:["HOT_OBJECT_EXPIRED"] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed on network errors with one opaque enum, no credentials", async () => {
    vi.stubEnv("GEOMACRO_COMMERCE_LEDGER_TOKEN", "a".repeat(64));
    const fetchMock = vi.fn(async () => { throw new Error("PRIVATE-BACKEND-TOKEN-MUST-NOT-LEAK"); });
    vi.stubGlobal("fetch", fetchMock);
    const result = await probe();
    expect(result).toEqual({ result:null, codes:["CONTROL_PLANE_TRANSPORT_OR_JSON_INVALID"] });
    expect(JSON.stringify(result)).not.toContain("PRIVATE-BACKEND");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
