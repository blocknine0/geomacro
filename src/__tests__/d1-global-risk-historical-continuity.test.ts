import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import controlPlane from "../../workers/control-plane/src/index.mjs";
import {
  makeGriHistoricalContinuityMetadata,
} from "../../workers/control-plane/src/global-risk-historical-status.mjs";
import { readFileSync } from "node:fs";

const B2_KEY="geomacro-evidence/v1/live/global-risk/latest.json.gz";
const sha=(raw:string)=>createHash("sha256").update(raw).digest("hex");
const hour=60*60_000,day=24*hour;
const at=(value:number)=>new Date(value).toISOString();

function fixture({now=Date.now(),ageMs=3*hour}={}) {
  const generated=at(now-ageMs);
  const source=at(now-ageMs-15*60_000);
  const payload={
    schema:"geomacro.public-global-risk-live.v1",
    generated_at:generated,
    source_project:"ldpwajisioljyjtojvfx",
    data:{snapshotId:"risk-snapshot-original",snapshotAsOf:source,score:72,
      topEvent:{title:"PRIVATE_TEST_HEADLINE_NOT_FOR_PUBLIC_OUTPUT"}},
  };
  const payloadJson=JSON.stringify(payload);
  const row={
    product:"global-risk",
    schema_name:"geomacro.public-global-risk-live.v1",
    generated_at:generated,
    source_as_of:source,
    expires_at:at(now-ageMs+90*60_000),
    b2_object_key:B2_KEY,
    b2_sha256:"a".repeat(64),
    payload_sha256:sha(payloadJson),
    proof_schema:"geomacro.public-global-risk-live-proof.v1",
    verified_at:generated,
    source_run_id:"37912345678",
    payload_json:payloadJson,
  };
  let reads=0,writes=0;
  const env={
    DB:{
      prepare(sql:string){
        if(!sql.includes("SELECT product, schema_name")) throw new Error("READ_ONLY_D1_EXPECTED");
        return {
          bind(product:string){
            expect(product).toBe("global-risk");
            return {async first(){reads++;return row;}};
          },
        };
      },
    },
    CONTROL_PLANE_TOKEN:"t".repeat(64),
  };
  const request=new Request(
    "https://control.test/v1/public/historical-continuity/global-risk",
    {method:"GET"},
  );
  const current=new Request(
    "https://control.test/v1/public/hot-snapshot/global-risk",
    {method:"GET"},
  );
  return {row,payload,env,request,current,getReads:()=>reads,getWrites:()=>writes};
}

describe("#1827 historical archived Global Risk metadata never masquerades as fresh",()=>{
  it("returns only source-free historical metadata with immutable original snapshot time after hot expiry",async()=>{
    const f=fixture();
    const historical=await controlPlane.fetch(f.request,f.env);
    const result=await historical.json() as Record<string,unknown>;
    expect(historical.status).toBe(200);
    expect(historical.headers.get("Cache-Control")).toBe("no-store");
    expect(historical.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(result).toMatchObject({
      ok:true,schema:"geomacro.public-global-risk-historical-continuity.v1",
      product:"global-risk",historical_only:true,
      current_snapshot_available:false,
      status:"verified_historical_archive_anchor",
      anchor_kind:"direct_verified_b2_snapshot",
      archive_generated_at:f.row.generated_at,
      original_snapshot_as_of:f.row.source_as_of,
      independently_rechecked_b2_now:false,
      independently_verified_archive_at_past_write:true,
      hot_freshness_not_asserted:true,
      source_news_freshness_not_asserted:true,
      commercial_eligible:false,x402_chargeable:false,usdc_spent:0,
      source_rights_not_recertified:true,
    });
    expect(f.getReads()).toBe(1);
    expect(f.getWrites()).toBe(0);
    const text=JSON.stringify(result);
    expect(text).not.toContain("PRIVATE_TEST_HEADLINE");
    expect(text).not.toContain('"score"');
    expect(text).not.toContain('"payload_json"');
    expect(text).not.toContain('"b2_sha256"');
    expect(text).not.toContain('"source_run_id"');
    expect(text).not.toContain("geomacro-evidence/v1/live");
    const current=await controlPlane.fetch(f.current,f.env);
    expect(current.status).toBe(503);
    expect((await current.json() as {ok:boolean}).ok).toBe(false);
  });

  it("fails closed for tampered D1 payload/hash, source as-of mismatch, wrong B2 key, absent verified proof",async()=>{
    const mutations=[
      (f:ReturnType<typeof fixture>)=>{f.row.payload_json += " ";},
      (f:ReturnType<typeof fixture>)=>{f.row.payload_sha256="0".repeat(64);},
      (f:ReturnType<typeof fixture>)=>{f.row.source_as_of=at(Date.now()-6*hour);},
      (f:ReturnType<typeof fixture>)=>{f.row.b2_object_key="geomacro-evidence/v1/private/restricted-current-scoring/x";},
      (f:ReturnType<typeof fixture>)=>{f.row.proof_schema="UNVERIFIED";},
      (f:ReturnType<typeof fixture>)=>{f.row.source_run_id="malicious<script>";},
    ];
    for(const mut of mutations){
      const f=fixture();mut(f);
      const r=await controlPlane.fetch(f.request,f.env);
      expect(r.status).toBe(503);
      expect((await r.json() as {ok:boolean}).ok).toBe(false);
      expect(f.getWrites()).toBe(0);
    }
  });

  it("rejects old baseline outside existing verified 30-day historical retention",async()=>{
    const f=fixture({ageMs:31*day});
    const r=await controlPlane.fetch(f.request,f.env);
    expect(r.status).toBe(503);
    expect((await r.json() as {ok:boolean}).ok).toBe(false);
  });

  it("rejects future, hashless, reinterpreted baseline as current or fake model verification",()=>{
    const now=Date.now();
    const base={
      b2_sha256:"a".repeat(64),
      payload_sha256:"b".repeat(64),
      source_run_id:"37912345678",
      generated_at:at(now-4*hour),
      snapshot_as_of:at(now-5*hour),
      anchor_kind:"direct_verified_b2_snapshot",
    };
    const good=makeGriHistoricalContinuityMetadata(base,{now});
    expect(good.archive_age_minutes).toBe(240);
    expect(good.historical_only).toBe(true);
    expect(good.current_snapshot_available).toBe(false);
    expect(good.original_snapshot_as_of).toBe(base.snapshot_as_of);
    expect(()=>makeGriHistoricalContinuityMetadata({
      ...base,generated_at:at(now+10*60_000),
    },{now})).toThrow("GLOBAL_RISK_HISTORICAL_TIMESTAMP_INVALID");
    expect(()=>makeGriHistoricalContinuityMetadata({
      ...base,snapshot_as_of:at(now-3*hour),
    },{now})).toThrow("GLOBAL_RISK_HISTORICAL_SOURCE_FUTURE");
    expect(()=>makeGriHistoricalContinuityMetadata({
      ...base,anchor_kind:"prior_b2_baseline_of_independent_gri_proof",
    },{now})).toThrow("GLOBAL_RISK_HISTORICAL_BASELINE_SOURCE_UNPROVEN");
    const fallback=makeGriHistoricalContinuityMetadata({
      ...base,anchor_kind:"prior_b2_baseline_of_independent_gri_proof",
      snapshot_as_of:null,
    },{now});
    expect(fallback.original_snapshot_as_of).toBeNull();
    expect(fallback.archive_generated_at).toBe(base.generated_at);
    expect(fallback.independently_rechecked_b2_now).toBe(false);
    expect(fallback.x402_chargeable).toBe(false);
  });

  it("website unavailable state only reads historical metadata; it never shows history as a fresh score",()=>{
    const ui=readFileSync("src/components/gri/global-risk-workspace.tsx","utf8");
    const worker=readFileSync("workers/control-plane/src/index.mjs","utf8");
    expect(worker).toContain('url.pathname === "/v1/public/historical-continuity/global-risk"');
    expect(worker.indexOf('url.pathname === "/v1/public/historical-continuity/global-risk"'))
      .toBeLessThan(worker.indexOf("const auth = authorized(request, env)"));
    expect(ui).toContain("Global Risk Index");
    expect(ui).toContain("Verified GRI unavailable");
    expect(ui).toContain("Historical archive provenance available");
    expect(ui).toContain("The historical score and graph remain hidden");
    expect(ui).toContain("source_news_freshness_not_asserted");
    expect(ui).toContain("current_snapshot_available!==false");
    expect(ui).not.toContain("historicalArchive.score");
    expect(ui).not.toContain("setData(historicalArchive");
  });
});
