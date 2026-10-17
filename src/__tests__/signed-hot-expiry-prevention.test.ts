import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {classifyD1HotMetadata} from "../../scripts/ops/classify-d1-hot-metadata.mjs";
import {assessSignedHotExpiry,signedHotExpirySummary} from "../../scripts/ops/watch-signed-hot-expiry.mjs";

const NOW=Date.parse("2026-10-17T12:00:00.000Z");
const ISO=x=>new Date(NOW+x*60000).toISOString();
const specs={
  intelligence:["geomacro.public-intelligence-live.v1",
    "geomacro.public-intelligence-live-proof.v1",
    "geomacro-evidence/v1/live/public-intelligence/latest.json.gz",720],
  "global-risk":["geomacro.public-global-risk-live.v1",
    "geomacro.public-global-risk-live-proof.v1",
    "geomacro-evidence/v1/live/global-risk/latest.json.gz",180],
  "risk-indices":["geomacro.public-risk-indices-live.v1",
    "geomacro.public-risk-indices-live-proof.v1",
    "geomacro-evidence/v1/live/risk-indices-independent/latest.json.gz",180],
} as const;
const names=Object.keys(specs) as Array<keyof typeof specs>;
function rows(){
 return names.map((product)=>{
  const [schema_name,proof_schema,b2_object_key,max]=specs[product];
  return {product,schema_name,proof_schema,b2_object_key,
   generated_at:ISO(-2),source_as_of:ISO(-10),expires_at:ISO(max-10),
   b2_hash_length:64,payload_hash_length:64,payload_bytes:2500,source_run_id:"39000000000",
  };
 });
}
const assess=(rowsInput=rows())=>assessSignedHotExpiry(classifyD1HotMetadata(rowsInput,{nowMs:NOW}),{nowMs:NOW});
describe("signed product pre-expiry guard (metadata-only, no false renewal)",()=>{
 it("tracks the genuine source-time window rather than a generated-at clock",()=>{
  const out=assess();
  expect(out.all_three_within_safe_window).toBe(true);
  expect(out.products.intelligence.effective_minutes_to_expiry).toBe(710);
  expect(out.products["global-risk"].effective_minutes_to_expiry).toBe(170);
  expect(out.products["risk-indices"].effective_minutes_to_expiry).toBe(170);
  expect(out.current_signed_products_attested).toBeUndefined();
  expect(out.signed_proof_or_b2_readback_verified).toBe(false);
  expect(out.new_snapshot_published).toBe(false);
  expect(out.b2_requests).toBe(0);
  expect(out.d1_writes).toBe(0);
 });
 it("warns BEFORE the GRI 3-hour expiry without changing any source time",()=>{
  const v=rows();
  const risk=v.find(x=>x.product==="global-risk")!;
  risk.source_as_of=ISO(-35);
  risk.expires_at=ISO(55);
  const out=assess(v);
  expect(out.products["global-risk"].status).toBe("RENEWAL_DUE");
  expect(out.products["global-risk"].effective_minutes_to_expiry).toBe(55);
  expect(out.attention_required).toBe(true);
  expect(out.products["global-risk"].old_payload_retimestamp_allowed).toBe(false);
 });
 it("warns at intelligence two-hour lead while others remain current",()=>{
  const v=rows();
  const intelligence=v.find(x=>x.product==="intelligence")!;
  intelligence.source_as_of=ISO(-245);
  intelligence.expires_at=ISO(115);
  const out=assess(v);
  expect(out.products.intelligence.status).toBe("RENEWAL_DUE");
  expect(out.products.intelligence.renewal_lead_minutes).toBe(120);
  expect(out.products["global-risk"].status).toBe("WITHIN_WINDOW");
 });
 it("keeps expired or aged-out source metadata unavailable and red",()=>{
  const v=rows();
  for(const row of v){row.source_as_of=ISO(-1000);row.expires_at=ISO(-910);}
  const out=assess(v);
  expect(out.all_three_within_safe_window).toBe(false);
  for(const name of names)expect(out.products[name].status).toBe("EXPIRED");
 });
 it("never accepts a missing product or invented extension of its proof window",()=>{
  const absent=assess(rows().filter(x=>x.product!=="risk-indices"));
  expect(absent.products["risk-indices"].status).toBe("MISSING");
  const data=rows();
  const risk=data.find(x=>x.product==="global-risk")!;
  risk.expires_at=ISO(180);
  const out=assess(data);
  expect(out.products["global-risk"].status).toBe("INVALID");
 });
 it("does not leak source bytes, hashes, article identities or credentials",()=>{
  const data=rows().map(x=>({...x,source_secret:"DO_NOT_PRINT_SECRET",payload_json:"RAW_ARTICLE"}));
  const out=assess(data);
  const text=JSON.stringify(out)+signedHotExpirySummary(out);
  expect(text).not.toContain("DO_NOT_PRINT_SECRET");
  expect(text).not.toContain("RAW_ARTICLE");
  expect(out.real_funds_touched).toBe(false);
  expect(out.supabase_reads).toBe(0);
  expect(out.supabase_writes).toBe(0);
 });
 it("requires a single scheduled D1 metadata SELECT, no B2 and no writes",()=>{
  const yaml=readFileSync(".github/workflows/signed-hot-pre-expiry-guard.yml","utf8");
  expect(yaml).toContain("09,39 * * * *");
  expect(yaml).toContain("d1 execute geomacro-control-plane");
  expect(yaml).toContain("length(CAST(payload_json AS BLOB)) AS payload_bytes");
  expect(yaml).not.toContain("SELECT *");
  expect(yaml).not.toContain("DELETE FROM");
  expect(yaml).not.toContain("INSERT INTO");
  expect(yaml).not.toContain("B2_APPLICATION_KEY");
  expect(yaml).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  expect(yaml).toContain("workflow_dispatch: {}");
  expect(yaml).toContain("on:");
  expect(yaml).not.toContain("payments: write");
 });
});
