import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import globalRiskWorker from "../../workers/global-risk-edge/src/index.mjs";
import intelligenceWorker from "../../workers/intelligence-edge/src/index.mjs";
import riskIndicesWorker from "../../workers/risk-indices-edge/src/index.mjs";

const now = Date.now();
const freshAt = new Date(now - 60_000).toISOString();
const b2Sha = "a".repeat(64);

function livePackage(product: string) {
  if (product === "global-risk") {
    const domainIndices = Object.fromEntries(["geopolitics", "macro", "rare_earth"].map((key) => [key, {
      series: { "7D": { buckets: [{}, {}] } },
    }]));
    return {
      schema: "geomacro.public-global-risk-live.v1",
      generated_at: freshAt,
      source_project: "ldpwajisioljyjtojvfx",
      data: {
        snapshotId: "gri-test-1",
        snapshotAsOf: freshAt,
        methodologyVersion: "gri-v1.2.0",
        verificationStatus: "verified",
        auditPersisted: true,
        domainIndices,
      },
    };
  }
  if (product === "risk-indices") {
    return {
      schema: "geomacro.public-risk-indices-live.v1",
      generated_at: freshAt,
      source_project: "ldpwajisioljyjtojvfx",
      data: {
        contractVersion: "risk-indices-v1.1.0",
        parentMethodologyVersion: "gri-v1.2.0",
        verificationStatus: "verified",
        snapshotId: "indices-test-1",
        snapshotAsOf: freshAt,
        indices: ["geopolitics", "macro", "critical_minerals"].map((key) => ({
          key,
          status: "available",
          score: 50,
          series: { "7D": { buckets: [{}, {}] }, "30D": { buckets: [{}, {}] } },
        })),
      },
    };
  }
  return {
    schema: "geomacro.public-intelligence-live.v1",
    generated_at: freshAt,
    source_project: "ldpwajisioljyjtojvfx",
    rows: ["geopolitics", "macro", "rare_earth"].map((category) => ({
      id: `row-${category}`,
      source_title: "Geomacro finds a verified material development",
      summary: "Derived summary.",
      category,
      severity: 40,
      delta: null,
      created_at: freshAt,
      published_at: freshAt,
      public_status: "verified_b2",
    })),
  };
}

function hotSnapshot(product: string, validHash = true) {
  const value: any = livePackage(product);
  const payloadJson = JSON.stringify(value);
  const maxAgeMs = product === "intelligence" ? 12 * 60 * 60 * 1000 : 180 * 60 * 1000;
  const sourceAsOf = product === "intelligence" ? freshAt : value.data.snapshotAsOf;
  const key = product === "intelligence"
    ? "geomacro-evidence/v1/live/public-intelligence/latest.json.gz"
    : product === "global-risk"
      ? "geomacro-evidence/v1/live/global-risk/latest.json.gz"
      : "geomacro-evidence/v1/live/risk-indices-independent/latest.json.gz";
  return {
    ok: true,
    product,
    schema: value.schema,
    generated_at: value.generated_at,
    source_as_of: sourceAsOf,
    expires_at: new Date(Date.parse(sourceAsOf) + maxAgeMs).toISOString(),
    b2_object_key: key,
    b2_sha256: b2Sha,
    payload_sha256: validHash
      ? createHash("sha256").update(payloadJson).digest("hex")
      : "b".repeat(64),
    proof_schema: product === "intelligence"
      ? "geomacro.public-intelligence-live-proof.v1"
      : product === "global-risk"
        ? "geomacro.public-global-risk-live-proof.v1"
        : "geomacro.public-risk-indices-live-proof.v1",
    verified_at: new Date(now).toISOString(),
    source_run_id: "17201234567",
    verification_mode: "direct-b2-readback",
    full_b2_readback_verified: true,
    exact_gzip_restore_verified: true,
    baseline_b2_readback_verified: true,
    baseline_exact_gzip_restore_verified: true,
    current_b2_readback_verified: true,
    current_b2_snapshot_promoted: true,
    payload_json: payloadJson,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("B2 cap resilient public edge reads", () => {
  it("serves a distinct machine hot proof with its qualification deadline and no stale cache allowance",async()=>{
    const snapshot=hotSnapshot("intelligence");
    snapshot.proof_schema="geomacro.public-intelligence-machine-live-proof.v1";
    snapshot.expires_at=new Date(now+60_000).toISOString();
    vi.stubGlobal("caches",{default:{match:async()=>null,put:async()=>undefined}});
    vi.stubGlobal("fetch",async(input:RequestInfo|URL)=>String(input).includes("/v1/public/hot-snapshot/")
      ?Response.json(snapshot):Response.json({ok:false},{status:503}));
    const response=await intelligenceWorker.fetch(new Request("https://edge.test/intelligence"),{
      CONTROL_PLANE:{fetch:(request:Request)=>fetch(request.url)},
    },{waitUntil:()=>undefined});
    expect(response.status).toBe(200);
    expect(response.headers.get("x-geomacro-qualified-until")).toBe(snapshot.expires_at);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("refuses an expired machine response even when a POP retains its cached bytes",async()=>{
    const cached=new Response(JSON.stringify(livePackage("intelligence")),{
      headers:{"x-geomacro-qualified-until":new Date(now-60_000).toISOString(),
        "x-geomacro-b2-sha256":b2Sha}});
    vi.stubGlobal("caches",{default:{match:async()=>cached.clone(),put:async()=>undefined}});
    vi.stubGlobal("fetch",async()=>Response.json({ok:false},{status:503}));
    const response=await intelligenceWorker.fetch(new Request("https://edge.test/intelligence"),{
      CONTROL_PLANE:{fetch:(request:Request)=>fetch(request.url)},
    },{waitUntil:()=>undefined});
    // Historical continuity may remain readable; expired machine rows must not.
    const body=await response.json();
    expect(body.rows?.some((r:{id:string})=>r.id==="row-geopolitics")??false).toBe(false);
  });

  it.each([
    ["intelligence", intelligenceWorker, "/intelligence"],
    ["global-risk", globalRiskWorker, "/global-risk"],
    ["risk-indices", riskIndicesWorker, "/risk-indices"],
  ])("rejects 75m-old but still-valid signed %s proof from the live edge",async(product,worker,path)=>{
    const snapshot=hotSnapshot(product as string);
    const source=new Date(Date.now()-75*60_000).toISOString();
    const ttl=product==="intelligence"?12*60*60_000:180*60_000;
    snapshot.source_as_of=source;
    snapshot.expires_at=new Date(Date.parse(source)+ttl).toISOString();
    const value=JSON.parse(snapshot.payload_json);
    if(product==="intelligence"){
      for(const row of value.rows)row.published_at=source;
    }else value.data.snapshotAsOf=source;
    snapshot.payload_json=JSON.stringify(value);
    snapshot.payload_sha256=createHash("sha256").update(snapshot.payload_json).digest("hex");
    vi.stubGlobal("caches",{default:{match:async()=>null,put:async()=>undefined}});
    vi.stubGlobal("fetch",async(input:RequestInfo|URL)=>{
      if(String(input).includes("/v1/public/hot-snapshot/"))return Response.json(snapshot);
      return Response.json({ok:false,error:"NO_B2_CURRENT"},{status:503});
    });
    const response=await worker.fetch(new Request("https://edge.test"+path),{
      CONTROL_PLANE:{fetch:(request:Request)=>fetch(request.url)},
    },{waitUntil:()=>undefined});
    expect(response.headers.get("x-geomacro-serving-store")).not.toBe("cloudflare-d1");
  });

  it.each([
    ["intelligence", intelligenceWorker, "/intelligence"],
    ["global-risk", globalRiskWorker, "/global-risk"],
    ["risk-indices", riskIndicesWorker, "/risk-indices"],
  ])("serves the current %s snapshot from D1 when private B2 GET is capped", async (product, worker, path) => {
    let b2Reads = 0;
    vi.stubGlobal("caches", { default: { match: async () => null, put: async () => undefined } });
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/public/hot-snapshot/")) {
        return Response.json(hotSnapshot(product as string));
      }
      if (url.includes("/v1/public/intelligence-overlay")) {
        return Response.json({ ok: false }, { status: 503 });
      }
      b2Reads += 1;
      return new Response("B2_DOWNLOAD_CAP_EXCEEDED", { status: 403 });
    });

    const response = await worker.fetch(new Request(`https://edge.test${path}`), {
      B2_KEY_ID: "read-key",
      B2_APPLICATION_KEY: "read-secret",
      CONTROL_PLANE: {
        fetch: (request: Request) => fetch(request.url),
      },
    }, { waitUntil: () => undefined });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.schema).toBe(livePackage(product as string).schema);
    expect(response.headers.get("x-geomacro-serving-store")).toBe("cloudflare-d1");
    expect(response.headers.get("x-geomacro-b2-verification")).toBe("full-readback-hash-exact-restore");
    expect(b2Reads).toBe(0);
  });

  it.each([
    ["intelligence", intelligenceWorker, "/intelligence"],
    ["global-risk", globalRiskWorker, "/global-risk"],
    ["risk-indices", riskIndicesWorker, "/risk-indices"],
  ])("prefers the verified D1 %s hot snapshot over an already-warm Workers cache", async (product, worker, path) => {
    let cacheReads = 0;
    let cacheWrites = 0;
    vi.stubGlobal("caches", {
      default: {
        match: async () => {
          cacheReads += 1;
          return new Response(JSON.stringify({ stale: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        },
        put: async () => {
          cacheWrites += 1;
        },
      },
    });
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/public/hot-snapshot/")) {
        return Response.json(hotSnapshot(product as string));
      }
      throw new Error(`UNEXPECTED_ORIGIN_FETCH:${url}`);
    });

    const response = await worker.fetch(new Request(`https://edge.test${path}`), {
      B2_KEY_ID: "read-key",
      B2_APPLICATION_KEY: "read-secret",
      CONTROL_PLANE: {
        fetch: (request: Request) => fetch(request.url),
      },
    }, { waitUntil: () => undefined });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.schema).toBe(livePackage(product as string).schema);
    expect(response.headers.get("x-geomacro-serving-store")).toBe("cloudflare-d1");
    expect(response.headers.get("x-geomacro-b2-verification")).toBe("full-readback-hash-exact-restore");
    expect(cacheReads).toBe(0);
    expect(cacheWrites).toBe(1);
  });

  it("refuses to reclassify a 19-hour signed baseline as live merely because a new overlay exists", async () => {
    const baselineAt = new Date(Date.now() - 19 * 60 * 60 * 1000).toISOString();
    const overlayAt = new Date(Date.now() - 60_000).toISOString();
    const live = {
      ...livePackage("intelligence"),
      generated_at: baselineAt,
      rows: ["geopolitics", "macro", "rare_earth"].map((category) => ({
        id: `baseline-${category}`,
        source_title: "Geomacro finds a verified material development",
        summary: "Derived summary.",
        category,
        severity: 40,
        delta: null,
        created_at: baselineAt,
        published_at: baselineAt,
        public_status: "verified_b2",
      })),
    };
    const cached = new Response(JSON.stringify(live), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "x-geomacro-b2-sha256": b2Sha,
      },
    });
    vi.stubGlobal("caches", {
      default: {
        match: async () => cached.clone(),
        put: async () => undefined,
      },
    });
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/v1/public/intelligence-overlay")) {
        return Response.json({
          ok: true,
          schema: "geomacro.public-intelligence-live-observed.v1",
          generated_at: overlayAt,
          verified_b2_generated_at: baselineAt,
          source_id: "gdelt_v2_events",
          current_source_transport: "event_export",
          current_source_batch_at: overlayAt,
          current_evidence_contract: "gdelt-v2-event-export-conflict-root-v1",
          synthetic_score: false,
          raw_source_headlines_exposed: false,
          provider_identity_exposed: false,
          verified_b2_key: "geomacro-evidence/v1/live/public-intelligence/latest.json.gz",
          verified_b2_sha256: b2Sha,
          full_b2_readback_verified: true,
          exact_gzip_restore_verified: true,
          rows: [{
            id: "live-current-1",
            source_title: "Geomacro observes a current verified geopolitical development",
            summary: "Derived current observation.",
            category: "geopolitics",
            severity: null,
            delta: null,
            created_at: overlayAt,
            published_at: overlayAt,
            public_status: "live_observed",
          }],
        });
      }
      return new Response("unexpected", { status: 500 });
    });

    const response = await intelligenceWorker.fetch(
      new Request("https://edge.test/intelligence"),
      {
        B2_KEY_ID: "read-key",
        B2_APPLICATION_KEY: "read-secret",
        CONTROL_PLANE: { fetch: (request: Request) => fetch(request.url) },
      },
      { waitUntil: () => undefined },
    );
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(response.headers.get("x-geomacro-serving-store")).toBeNull();
    expect(body.ok).toBe(false);
  });

  it("fails closed when both the verified baseline clock and overlay identity are unfit", async () => {
    const baselineAt = new Date(Date.now() - 19 * 60 * 60 * 1000).toISOString();
    const overlayAt = new Date(Date.now() - 60_000).toISOString();
    const live = {
      ...livePackage("intelligence"),
      generated_at: baselineAt,
      rows: ["geopolitics", "macro", "rare_earth"].map((category) => ({
        id: `baseline-mismatch-${category}`,
        source_title: "Geomacro finds a verified material development",
        summary: "Derived summary.",
        category,
        severity: 40,
        delta: null,
        created_at: baselineAt,
        published_at: baselineAt,
        public_status: "verified_b2",
      })),
    };
    const cached = new Response(JSON.stringify(live), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "x-geomacro-b2-sha256": b2Sha,
      },
    });
    vi.stubGlobal("caches", {
      default: {
        match: async () => cached.clone(),
        put: async () => undefined,
      },
    });
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      if (String(input).includes("/v1/public/intelligence-overlay")) {
        return Response.json({
          ok: true,
          schema: "geomacro.public-intelligence-live-observed.v1",
          generated_at: overlayAt,
          verified_b2_generated_at: new Date(Date.parse(baselineAt) + 60_000).toISOString(),
          source_id: "gdelt_v2_events",
          current_source_transport: "event_export",
          current_source_batch_at: overlayAt,
          current_evidence_contract: "gdelt-v2-event-export-conflict-root-v1",
          synthetic_score: false,
          raw_source_headlines_exposed: false,
          provider_identity_exposed: false,
          verified_b2_key: "geomacro-evidence/v1/live/public-intelligence/latest.json.gz",
          verified_b2_sha256: b2Sha,
          full_b2_readback_verified: true,
          exact_gzip_restore_verified: true,
          rows: [{
            id: "live-current-mismatch-1",
            source_title: "Geomacro observes a current verified geopolitical development",
            summary: "Derived current observation.",
            category: "geopolitics",
            severity: null,
            delta: null,
            created_at: overlayAt,
            published_at: overlayAt,
            public_status: "live_observed",
          }],
        });
      }
      return new Response("unexpected", { status: 500 });
    });

    const response = await intelligenceWorker.fetch(
      new Request("https://edge.test/intelligence"),
      {
        B2_KEY_ID: "read-key",
        B2_APPLICATION_KEY: "read-secret",
        CONTROL_PLANE: { fetch: (request: Request) => fetch(request.url) },
      },
      { waitUntil: () => undefined },
    );
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(response.headers.get("x-geomacro-serving-store")).toBeNull();
    expect(body.ok).toBe(false);
  });

  it("fails closed when a D1 hot payload hash is invalid and B2 is capped", async () => {
    vi.stubGlobal("caches", { default: { match: async () => null, put: async () => undefined } });
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      if (String(input).includes("/v1/public/hot-snapshot/")) {
        return Response.json(hotSnapshot("global-risk", false));
      }
      return new Response("B2_DOWNLOAD_CAP_EXCEEDED", { status: 403 });
    });
    const response = await globalRiskWorker.fetch(new Request("https://edge.test/global-risk"), {
      B2_KEY_ID: "read-key",
      B2_APPLICATION_KEY: "read-secret",
      CONTROL_PLANE: {
        fetch: (request: Request) => fetch(request.url),
      },
    }, { waitUntil: () => undefined });
    expect(response.status).toBe(503);
  });
});
