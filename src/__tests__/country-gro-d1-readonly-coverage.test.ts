import { describe,expect,it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import prettier from "prettier";
import { canonicalRiskObjectJson } from "../lib/risk-object-signing.server";
import {
  auditD1HotCountryGro,
  evaluateD1HotCountryGroRows,
  MAX_HOT_GRO_ROWS,
  D1_AUDIT_MAX_REQUESTS,
} from "../../scripts/ops/audit-country-gro-d1-hot-readonly";

const AT=new Date("2026-10-10T09:00:00.000Z");
const sha=(s:string)=>createHash("sha256").update(s).digest("hex");
const dbid="aaff0011-2233-4455-6677-aabbccddeeff";
const accountId="a".repeat(32);
const token="b".repeat(48);
function rowFor(country="IND",expiresAt="2026-10-10T11:00:00.000Z"){
  const o={
    commercial_eligibility:{status:"VERIFIED"},
    expires_at:expiresAt,
    generated_at:"2026-10-10T08:00:00.000Z",
    integrity:{
      payload_hash:"c".repeat(64),
      signing_key_id:"key-test-no-public-trust",
      signature:"untrusted-placeholder",
    },
    object_id:"country-"+country,
    schema_version:"gro-1.1",
    subject:{id:country,type:"country"},
    verification:{status:"VERIFIED"},
  };
  const object_json=canonicalRiskObjectJson(o);
  return {
    country_iso3:country,
    object_id:o.object_id,schema_version:o.schema_version,
    generated_at:o.generated_at,expires_at:o.expires_at,
    signing_key_id:o.integrity.signing_key_id,
    payload_hash:o.integrity.payload_hash,
    record_sha256:sha(object_json),
    archive_key:"geomacro-evidence/v1/live/country-gro/bundles/fixture.json.gz",
    archive_sha256:"d".repeat(64),
    archive_write_acknowledged:1,
    object_json,
  };
}
describe("#1827 zero-Supabase/B2 D1 GRO current signed hot observer",()=>{
  it("reports only independently admitted CURRENT D1 hot derived signatures as audit, never 195x3 paid readiness",()=>{
    const seen:string[]=[];
    const r=evaluateD1HotCountryGroRows([
      rowFor("IND"),rowFor("USA"),rowFor("BRA","2026-10-10T06:00:00.000Z"),
    ],{
      at:AT,
      verifyArtifact:(o,time)=>{
        seen.push(o.subject.id);
        expect(time.toISOString()).toBe(AT.toISOString());
        return o.subject.id==="IND";
      },
    });
    expect(r).toMatchObject({
      ok:true,audit_only:true,
      d1_hot_row_count:3,
      cryptographically_verified_current_d1_hot_count:1,
      expired_count:1,invalid_or_ineligible_count:1,
      d1_hot_195_count_threshold_met:false,
      global_195_country_coverage_claimed:false,
      three_domain_195_country_coverage_claimed:false,
      commercial_launch_accepted:false,
      public_freshness_advanced:false,
      b2_get_requests:0,b2_put_requests:0,
      supabase_reads:0,supabase_writes:0,d1_writes:0,
      signing_operations:0,external_payment_performed:false,
    });
    expect(seen).toEqual(["IND","USA"]);
    expect(JSON.stringify(r)).not.toContain("archive_key");
    expect(JSON.stringify(r)).not.toContain("object_json");
    expect(JSON.stringify(r)).not.toContain("untrusted-placeholder");
    expect(JSON.stringify(r)).not.toContain("country-IND");
  });
  it("fail-closes tampering, absent archive ack, fake key fields and zero signature verification",()=>{
    const good=rowFor();
    for(const bad of [
      {...good,object_json:good.object_json.replace("VERIFIED","PENDING")},
      {...good,record_sha256:"f".repeat(64)},
      {...good,payload_hash:"f".repeat(64)},
      {...good,archive_write_acknowledged:0},
      {...good,archive_sha256:"invalid"},
      {...good,archive_key:"geomacro-evidence/v1/private/secret.json.gz"},
      {...good,object_id:"forged-object"},
      {...good,signing_key_id:"revoked-key"},
    ]) {
      const result=evaluateD1HotCountryGroRows([bad],{at:AT,verifyArtifact:()=>true});
      expect(result.cryptographically_verified_current_d1_hot_count).toBe(0);
      expect(result.invalid_or_ineligible_count).toBe(1);
    }
    expect(evaluateD1HotCountryGroRows([good],{
      at:AT,verifyArtifact:()=>false,
    }).cryptographically_verified_current_d1_hot_count).toBe(0);
  });
  it("requires unique ISO3, bounded rows and separately actual verified subjects",()=>{
    expect(()=>evaluateD1HotCountryGroRows([rowFor(),rowFor()],{
      at:AT,verifyArtifact:()=>true,
    })).toThrow("COUNTRY_GRO_D1_AUDIT_DUPLICATE_OR_INVALID_COUNTRY");
    expect(()=>evaluateD1HotCountryGroRows(new Array(MAX_HOT_GRO_ROWS+1).fill(rowFor()),{
      at:AT,verifyArtifact:()=>true,
    })).toThrow("COUNTRY_GRO_D1_AUDIT_ROWS_UNBOUNDED");
    expect(D1_AUDIT_MAX_REQUESTS).toBeLessThanOrEqual(25);
  });
  it("D1 REST-only paging uses bounded, parameterized SELECT; rejects untrusted signatures (no payment)",async()=>{
    const calls:Array<{url:string,opts:RequestInit}>=[];
    const sample=rowFor();
    const mock=async(url:string|URL|Request,opts?:RequestInit)=>{
      const uri=String(url);
      calls.push({url:uri,opts:opts??{}});
      if(uri.includes("/d1/database?")) {
        return Response.json({success:true,result:[{name:"geomacro-control-plane",uuid:dbid}]});
      }
      if(uri.includes("/d1/database/"+dbid+"/query")){
        const body=JSON.parse(String(opts?.body));
        expect(body.batch[0].sql).toMatch(/^SELECT country_iso3,/);
        expect(body.batch[0].sql).not.toMatch(/INSERT|UPDATE|DELETE|DROP|ALTER/i);
        expect(body.batch[0].params).toHaveLength(2);
        const offset=Number(body.batch[0].params[1]);
        return Response.json({
          success:true,result:[{success:true,results:offset===0?[sample]:[]}],
        });
      }
      throw Error("UNEXPECTED_EXTERNAL_URL");
    };
    const result=await auditD1HotCountryGro({
      accountId,apiToken:token,at:AT,
      fetchImpl:mock as typeof fetch,
      verificationKeys:{
        "key-test-no-public-trust":{
          public_key_spki_b64:"untrusted",status:"revoked",
        },
      },
    });
    expect(result).toMatchObject({
      d1_hot_row_count:1,cryptographically_verified_current_d1_hot_count:0,
      global_195_country_coverage_claimed:false,
      d1_readonly_requests:2,trust_checked_for_rows:true,
    });
    expect(calls).toHaveLength(2);
    expect(calls[0].opts.method).toBe("GET");
    expect(calls[1].opts.method).toBe("POST"); // read-only SQL via Cloudflare API
    expect(JSON.stringify(result)).not.toContain("untrusted");
  });
  it("denies missing Cloudflare scope or API error without attempting B2/Supabase fallback",async()=>{
    await expect(auditD1HotCountryGro({
      accountId:"attacker",apiToken:token,fetchImpl:async()=>{throw Error("NETWORK_UNEXPECTED");},
    })).rejects.toThrow("COUNTRY_GRO_D1_AUDIT_AUTH_INVALID");
    await expect(auditD1HotCountryGro({
      accountId,apiToken:token,
      fetchImpl:async()=>new Response("unavailable",{status:503}),
    })).rejects.toThrow("COUNTRY_GRO_D1_AUDIT_CLOUDFLARE_REQUEST_FAILED");
  });
  it("real YAML separates hourly READ-ONLY observation from owner-only Supabase writer",async()=>{
    const workflow=readFileSync(".github/workflows/b2-country-gro-continuity.yml","utf8");
    const parsed=await prettier.format(workflow,{parser:"yaml"});
    expect(parsed).toContain("observe-existing-d1-hot:");
    expect(parsed).toContain("publish:");
    expect(workflow).toContain('cron: "41 * * * *"');
    expect(workflow).not.toContain("  push:\n");
    expect(workflow).toContain("github.event_name == 'schedule'");
    expect(workflow).toContain("github.event_name == 'workflow_dispatch'");
    expect(workflow).toContain("Read D1 hot GRO rows; independently verify signatures");
    expect(workflow).toContain("audit-country-gro-d1-hot-readonly.ts --read-only");
    expect(workflow).toContain("Enforce canonical Supabase budget before country GRO writers and B2 seed");
    const observer=workflow.slice(workflow.indexOf("  observe-existing-d1-hot:"),workflow.indexOf("  publish:"));
    expect(observer).not.toContain("secrets.SUPABASE");
    expect(observer).not.toContain("B2_KEY_ID");
    expect(observer).not.toContain("GEOMACRO_COMMERCE_LEDGER_TOKEN");
    expect(observer).not.toContain("publish-country-gro-hot-bundle");
    const legacy=workflow.slice(workflow.indexOf("  publish:"));
    expect(legacy).toContain('GLOBAL_CANONICAL_MIN_READY: "195"');
    expect(legacy).toContain("node scripts/ops/supabase-free-tier-budget.mjs --require-bulk-write --require-normal");
    expect(legacy).toContain("Refresh global commercially governed canonical GROs");
  });
  it("CLI's production implementation requires independent trust and commercial verifier, never raw or D1 mutation",()=>{
    const source=readFileSync("scripts/ops/audit-country-gro-d1-hot-readonly.ts","utf8");
    expect(source).toContain("verifyRiskObjectSignature(object as any,trust)");
    expect(source).toContain("verifyCommercialRiskObjectArtifact(object as any,");
    expect(source).toContain("loadPublicRiskObjectVerificationKeys()");
    expect(source).toContain("canonicalRiskObjectJson(object)");
    expect(source).toContain('"--read-only"');
    expect(source).not.toContain("supabase.from(");
    expect(source).not.toContain("b2.put(");
    expect(source).not.toContain("b2.get(");
    expect(source).toContain("COUNTRY_GRO_D1_AUDIT_PRIVILEGED_CREDS_FORBIDDEN");
  });
});
