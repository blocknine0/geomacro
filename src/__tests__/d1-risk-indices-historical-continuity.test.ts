import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import controlPlane from "../../workers/control-plane/src/index.mjs";
import { makeRiskIndicesHistoricalMetadata } from
  "../../workers/control-plane/src/risk-indices-historical-status.mjs";
import { readFileSync } from "node:fs";

const B2_KEY="geomacro-evidence/v1/live/risk-indices-independent/latest.json.gz";
const sha=(s:string)=>createHash("sha256").update(s).digest("hex");
const H=60*60_000, D=24*H;
const iso=(ms:number)=>new Date(ms).toISOString();
const now=Date.now();
function fixture(age=3*H) {
  const generated=iso(now-age), original=iso(now-age-15*60_000);
  const keys=["geopolitics","macro","critical_minerals"];
  const payload={
    schema:"geomacro.public-risk-indices-live.v1",
    generated_at:generated,
    source_project:"ldpwajisioljyjtojvfx",
    data:{
      contractVersion:"risk-indices-v1.1.0",
      parentMethodologyVersion:"gri-v1.2.0",
      verificationStatus:"verified",
      snapshotAsOf:original,
      indices:keys.map(key=>({
        key,status:"available",
        value:77,
        rawPublisherTitle:"SECRET_SOURCE_NOT_PUBLIC",
        series:{"7D":{buckets:[{},{}]},"30D":{buckets:[{},{},{}]}},
      })),
    },
  };
  const row={
    product:"risk-indices",
    schema_name:"geomacro.public-risk-indices-live.v1",
    generated_at:generated,
    source_as_of:original,
    expires_at:iso(now-age+90*60_000),
    b2_object_key:B2_KEY,
    b2_sha256:"a".repeat(64),
    payload_sha256:sha(JSON.stringify(payload)),
    proof_schema:"geomacro.public-risk-indices-live-proof.v1",
    verified_at:generated,
    source_run_id:"37912345678",
    payload_json:JSON.stringify(payload),
  };
  let reads=0,writes=0;
  const env={
    DB:{
      prepare(sql:string){
        expect(sql).toContain("SELECT product, schema_name");
        return {bind(product:string){
          expect(product).toBe("risk-indices");
          return {async first(){reads++;return row;}};
        }};
      },
    },
    CONTROL_PLANE_TOKEN:"t".repeat(64),
  };
  const historical=new Request("https://control.test/v1/public/historical-continuity/risk-indices");
  const hot=new Request("https://control.test/v1/public/hot-snapshot/risk-indices");
  return {payload,row,env,historical,hot,reads:()=>reads,writes:()=>writes};
}
describe("#1827 Risk Indices hash-bound archived context without fake current risk",()=>{
  it("serves historic verified metadata after the 90-minute hot D1 TTL without any B2 GET, write or score leak",async()=>{
    const f=fixture();
    const response=await controlPlane.fetch(f.historical,f.env);
    const data=await response.json() as Record<string,unknown>;
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(data).toMatchObject({
      ok:true,schema:"geomacro.public-risk-indices-historical-continuity.v1",
      product:"risk-indices",historical_only:true,
      current_snapshot_available:false,status:"verified_historical_archive_anchor",
      archive_generated_at:f.row.generated_at,
      original_snapshot_as_of:f.row.source_as_of,
      prior_verified_domains:["geopolitics","macro","critical_minerals"],
      independently_rechecked_b2_now:false,
      independently_verified_archive_at_past_write:true,
      source_news_freshness_not_asserted:true,hot_freshness_not_asserted:true,
      commercial_eligible:false,x402_chargeable:false,usdc_spent:0,
    });
    expect(f.reads()).toBe(1);
    expect(f.writes()).toBe(0);
    for(const secret of ["SECRET_SOURCE_NOT_PUBLIC",'"value"','"payload_json"',
      '"b2_sha256"','"source_run_id"',B2_KEY]) {
      expect(JSON.stringify(data)).not.toContain(secret);
    }
    const current=await controlPlane.fetch(f.hot,f.env);
    expect(current.status).toBe(503);
  });

  it("fails closed when archive hash, schema, source clock, B2 key, methodology or index set does not verify",async()=>{
    const changes=[
      (f:ReturnType<typeof fixture>)=>{f.row.payload_json += " ";},
      (f:ReturnType<typeof fixture>)=>{f.row.payload_sha256="0".repeat(64);},
      (f:ReturnType<typeof fixture>)=>{f.row.proof_schema="unknown";},
      (f:ReturnType<typeof fixture>)=>{f.row.b2_object_key="private/unapproved";},
      (f:ReturnType<typeof fixture>)=>{f.row.source_as_of=iso(now-2*H);},
      (f:ReturnType<typeof fixture>)=>{f.row.source_run_id="hello<script>";},
      (f:ReturnType<typeof fixture>)=>{f.row.schema_name="other-schema";},
      (f:ReturnType<typeof fixture>)=>{
        f.payload.data.parentMethodologyVersion="other";
        f.row.payload_json=JSON.stringify(f.payload);
        f.row.payload_sha256=sha(f.row.payload_json);
      },
      (f:ReturnType<typeof fixture>)=>{
        f.payload.data.indices[1].key="geopolitics";
        f.row.payload_json=JSON.stringify(f.payload);
        f.row.payload_sha256=sha(f.row.payload_json);
      },
    ];
    for(const change of changes){
      const f=fixture();change(f);
      const response=await controlPlane.fetch(f.historical,f.env);
      expect(response.status).toBe(503);
      expect((await response.json() as {ok:boolean}).ok).toBe(false);
      expect(f.writes()).toBe(0);
    }
  });
  it("rejects ancient or future original archive timestamps, never redates stale original sources",async()=>{
    const old=fixture(31*D);
    expect((await controlPlane.fetch(old.historical,old.env)).status).toBe(503);
    const future=fixture();
    future.row.source_as_of=iso(now+10*60_000);
    const result=await controlPlane.fetch(future.historical,future.env);
    expect(result.status).toBe(503);
    expect(()=>makeRiskIndicesHistoricalMetadata({
      anchor_kind:"direct_verified_b2_snapshot",
      b2_sha256:"a".repeat(64),payload_sha256:"b".repeat(64),
      source_run_id:"3791234",generated_at:iso(now-3*H),
      snapshot_as_of:iso(now-H),
    },{now})).toThrow("RISK_INDICES_HISTORICAL_ORIGINAL_TIME_AFTER_ARCHIVE");
  });
  it("never replaces current hot/paid path or touches website lock",()=>{
    const code=readFileSync("workers/control-plane/src/index.mjs","utf8");
    const website=readFileSync("src/components/gri/global-risk-workspace.tsx","utf8");
    expect(code).toContain('url.pathname === "/v1/public/historical-continuity/risk-indices"');
    expect(code.indexOf('url.pathname === "/v1/public/historical-continuity/risk-indices"'))
      .toBeLessThan(code.indexOf("const auth = authorized(request, env)"));
    expect(code).toContain("return getPublicHotSnapshot(env, decodeURIComponent(parts[3]));");
    expect(website).not.toContain("RISK_INDICES_HISTORICAL");
  });
});
