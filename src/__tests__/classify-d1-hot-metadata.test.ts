import { describe,expect,it } from "vitest";
import { readFileSync } from "node:fs";
import {
  classifyD1HotMetadata,parseWranglerMetadata,
} from "../../scripts/ops/classify-d1-hot-metadata.mjs";

const nowMs=Date.parse("2026-10-10T08:00:00.000Z");
const keys=["intelligence","global-risk","risk-indices"] as const;
const specs=[
  ["geomacro.public-intelligence-live.v1","geomacro.public-intelligence-live-proof.v1",
    "geomacro-evidence/v1/live/public-intelligence/latest.json.gz"],
  ["geomacro.public-global-risk-live.v1","geomacro.public-global-risk-live-proof.v1",
    "geomacro-evidence/v1/live/global-risk/latest.json.gz"],
  ["geomacro.public-risk-indices-live.v1","geomacro.public-risk-indices-live-proof.v1",
    "geomacro-evidence/v1/live/risk-indices-independent/latest.json.gz"],
];
function rows(){
  return keys.map((product,i)=>({
    product,schema_name:specs[i][0],proof_schema:specs[i][1],b2_object_key:specs[i][2],
    generated_at:"2026-10-10T07:40:00.000Z",
    source_as_of:"2026-10-10T07:30:00.000Z",
    expires_at:"2026-10-10T08:30:00.000Z",
    b2_hash_length:64,payload_hash_length:64,payload_bytes:2048,
    source_run_id:"38033332847",
    private_token:"MUST_NOT_OUTPUT_SECRET",payload_json:"MUST_NOT_OUTPUT_ARTICLE",
  }));
}
describe("#1827 bounded private D1 expiry audit",()=>{
  it("classifies three metadata-only hot rows without granting commercial eligibility",()=>{
    const output=classifyD1HotMetadata(rows(),{nowMs});
    expect(output.all_three_metadata_eligible).toBe(true);
    for(const product of keys){
      expect(output.products[product].state).toBe("METADATA_ONLY_POSSIBLE");
      expect(output.products[product].source_age_minutes).toBe(30);
      expect(output.products[product].expiry_in_minutes).toBe(30);
    }
    expect(output.commercial_eligibility_verified).toBe(false);
    expect(output.payload_bytes_read).toBe(false);
    expect(output.raw_source_exposed).toBe(false);
    expect(output.b2_requests).toBe(0);
    expect(output.d1_writes).toBe(0);
    expect(output.payment_performed).toBe(false);
    expect(JSON.stringify(output)).not.toMatch(/MUST_NOT_OUTPUT/);
  });
  it("isolates genuine obsolete source timestamps and expired rows, never backdates",()=>{
    const data=rows();
    for(const row of data){
      row.generated_at="2026-10-08T22:10:00.000Z";
      row.source_as_of="2026-10-08T22:09:36.000Z";
      row.expires_at="2026-10-08T23:39:36.000Z";
    }
    const result=classifyD1HotMetadata(data,{nowMs});
    expect(result.all_three_metadata_eligible).toBe(false);
    for(const product of keys){
      expect(result.products[product].reasons).toEqual(expect.arrayContaining([
        "SOURCE_TOO_OLD","EXPIRED",
      ]));
      expect(result.products[product].metadata_eligible).toBe(false);
      expect(result.products[product].source_age_minutes).toBeGreaterThan(1000);
    }
  });
  it("refuses missing, future, invalid-hash metadata, oversized payload and bad expiry",()=>{
    const data=rows();
    data.shift();
    data[0].source_as_of="2026-10-11T08:00:00.000Z";
    data[0].expires_at="2026-10-11T09:00:00.000Z";
    data[0].payload_bytes=2_000_000;
    data[0].b2_hash_length=1;
    data[1].schema_name="unsafe-injected";
    data[1].expires_at="2026-10-10T18:00:00.000Z";
    const result=classifyD1HotMetadata(data,{nowMs});
    expect(result.products.intelligence.reasons).toContain("ROW_ABSENT");
    expect(result.products["global-risk"].reasons).toEqual(expect.arrayContaining([
      "FUTURE_TIMESTAMP","PROOF_METADATA_INVALID",
    ]));
    expect(result.products["risk-indices"].reasons).toEqual(expect.arrayContaining([
      "PUBLISHER_CONTRACT_INVALID","EXPIRY_WINDOW_INVALID",
    ]));
  });
  it("rejects unauthenticated or malformed Wrangler responses and duplicate or injected keys",()=>{
    const good=rows();
    const parsed=parseWranglerMetadata(JSON.stringify([{
      success:true,results:good,meta:{sensitive:"DONT_LEAK"},
    }]),{nowMs});
    expect(parsed.all_three_metadata_eligible).toBe(true);
    expect(JSON.stringify(parsed)).not.toContain("DONT_LEAK");
    for(const value of ["not json", "{}",'{"result":[]}',
      JSON.stringify([{success:false,results:good}])]){
      expect(()=>parseWranglerMetadata(value,{nowMs})).toThrow();
    }
    expect(()=>classifyD1HotMetadata([good[0],good[0]],{nowMs})).toThrow();
    expect(()=>classifyD1HotMetadata([{product:"__proto__"}],{nowMs})).toThrow();
    expect(()=>classifyD1HotMetadata(good,{nowMs:NaN})).toThrow();
  });
  it("keeps the production workflow strictly single SELECT without B2 or mutation",()=>{
    const yaml=readFileSync(".github/workflows/public-hot-serving-diagnostic.yml","utf8");
    const script=readFileSync("scripts/ops/classify-d1-hot-metadata.mjs","utf8");
    expect(yaml).toContain("environment: production");
    expect(yaml).toContain("if: always()");
    expect(yaml).toContain("d1 execute geomacro-control-plane");
    expect(yaml).toContain("--remote --json --command");
    expect(yaml).toContain("length(CAST(payload_json AS BLOB)) AS payload_bytes");
    expect(yaml).not.toContain("SELECT *");
    expect(yaml).not.toContain("DELETE FROM");
    expect(yaml).not.toContain("INSERT INTO");
    expect(yaml).not.toContain("UPDATE public_b2_hot_snapshot");
    expect(yaml).not.toContain("B2_APPLICATION_KEY");
    expect(yaml).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(script).not.toContain("fetch(");
    expect(script).not.toContain("execSync");
    expect(script).not.toContain("source_run_id:row");
  });
});
