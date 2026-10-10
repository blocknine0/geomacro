import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { diagnosePublicHotServing, summarizePublicHotServing } from "../../scripts/ops/diagnose-public-hot-serving.mjs";

const NOW=Date.parse("2026-10-09T16:00:00.000Z");
const recent="2026-10-09T15:35:00.000Z";
const expires="2026-10-09T17:00:00.000Z";
const keys=["intelligence","global-risk","risk-indices"];
function fakeFetch({
  siteStatus=200, failProduct=null, d1Status=200,
}:{
  siteStatus?:number; failProduct?:string|null; d1Status?:number;
}={}) {
  const calls: string[]=[];
  const fetchImpl=async(url:string,options:Record<string,any>)=>{
    calls.push(url);
    expect(options.method).toBe("GET");
    expect(options.redirect).toBe("error");
    expect(options.headers.authorization).toBeUndefined();
    const isSite=url.includes("/api/health?deep=1");
    if(isSite) return Response.json({
      ok:siteStatus===200,
      public_production:{
        deep_checked:true, b2_runtime_configured:true, intelligence_ready:true,
        global_risk_ready:true, risk_indices_ready:true,
        supabase_required_for_serving:false,
        serving_authority:siteStatus===200?"backblaze-b2-durable-truth-cloudflare-d1-verified-hot":
          "backblaze-b2-with-d1-hot-snapshot-required",
        hot_snapshot_serving:{
          intelligence:{ok:failProduct!=="intelligence",serving_store:"cloudflare-d1",source_as_of:recent},
          global_risk:{ok:failProduct!=="global-risk",serving_store:"cloudflare-d1",source_as_of:recent},
          risk_indices:{ok:failProduct!=="risk-indices",serving_store:"cloudflare-d1",source_as_of:recent},
        },
      },
      // Raw source data must never be included in diagnostic evidence.
      secret:"NEVER_REPORT_THIS",
    },{status:siteStatus});
    if(url.endsWith("/health")) return Response.json({
      ok:d1Status===200,store:"d1",schema_version:5,
    },{status:d1Status});
    const product=keys.find(k=>url.endsWith("/"+k));
    expect(product).toBeDefined();
    if(product===failProduct) return Response.json({
      ok:false,error:"HOT_SNAPSHOT_STALE_OR_INVALID",raw:"DO_NOT_EXPORT",
    },{status:503});
    return Response.json({
      ok:true,product,source_as_of:recent,expires_at:expires,
      verification_mode:"direct-b2-readback",
      baseline_b2_readback_verified:true,
      baseline_exact_gzip_restore_verified:true,
      full_b2_readback_verified:true,
      exact_gzip_restore_verified:true,
      payload_json:'{"provider_token":"SHOULD_NOT_BE_REPEATED"}',
    });
  };
  return {fetchImpl,calls};
}

describe("#1827 public B2/D1 503 classification without rights bypass",()=>{
  it("identifies exactly which of three D1 hot snapshots is unavailable",async()=>{
    const {fetchImpl,calls}=fakeFetch({siteStatus:503,failProduct:"global-risk"});
    const result=await diagnosePublicHotServing({fetchImpl,nowMs:NOW});
    expect(calls).toHaveLength(5);
    expect(result.ok).toBe(false);
    expect(result.unavailable_products).toEqual(["global-risk"]);
    expect(result.failure_codes).toContain("PUBLIC_DEEP_HEALTH_503");
    const redSummary=summarizePublicHotServing(result);
    expect(redSummary.ok).toBe(false);
    expect(redSummary.intelligence_hot_snapshot_ready).toBe(true);
    expect(redSummary.current_scored_domain_coverage.geopolitics).toBeNull();
    expect(result.products["global-risk"]).toMatchObject({
      ok:false,error:"HOT_SNAPSHOT_STALE_OR_INVALID",http_status:503,
    });
    expect(result.products.intelligence.ok).toBe(true);
    expect(result.products["risk-indices"].ok).toBe(true);
    const output=JSON.stringify(result);
    expect(output).not.toContain("NEVER_REPORT_THIS");
    expect(output).not.toContain("DO_NOT_EXPORT");
    expect(output).not.toContain("SHOULD_NOT_BE_REPEATED");
    expect(result.external_payment_performed).toBe(false);
    expect(result.commercial_eligibility_verified).toBe(false);
    expect(result.b2_private_archive_reads).toBe(0);
    expect(result.supabase_network_attempts).toBe(0);
  });

  it("accepts full public freshness evidence only if site, D1 and all 3 snapshots agree",async()=>{
    const {fetchImpl}=fakeFetch();
    const result=await diagnosePublicHotServing({fetchImpl,nowMs:NOW});
    expect(result.ok).toBe(true);
    expect(result.unavailable_products).toEqual([]);
    expect(result.failure_codes).toEqual([]);
    expect(result.d1).toMatchObject({ok:true,schema_version:5});
    expect(result.products["intelligence"].source_as_of).toBe(recent);
    expect(result.site.public_serving_claim_verified).toBe(true);
    // Three valid D1 hot products do not establish current 24h per-domain
    // scored publisher evidence, rights or independent corroboration.
    const summary=summarizePublicHotServing(result);
    expect(summary.intelligence_hot_snapshot_ready).toBe(true);
    expect(summary.current_scored_domain_coverage).toEqual({
      status:"NOT_ASSESSED_BY_HOT_SERVING_DIAGNOSTIC",
      geopolitics:null,macro_fx:null,critical_minerals:null,
    });
    expect(summary).not.toHaveProperty("public_domain_ready");
    expect(summary.commercial_eligibility_verified).toBe(false);
  });

  it("refuses stale/unknown D1 schema and transport failures, never green",async()=>{
    const fetchImpl=async(url:string)=>{
      if(url.includes("/api/health?deep=1")) throw Error("site unreachable");
      if(url.endsWith("/health")) return Response.json({ok:true,store:"d1",schema_version:4});
      return Response.json({ok:false,error:"D1_UNAVAILABLE",raw_message:"BLOCK_THIS"}, {status:503});
    };
    const result=await diagnosePublicHotServing({fetchImpl,nowMs:NOW});
    expect(result.ok).toBe(false);
    expect(result.site.http_status).toBe(0);
    const unreachable=summarizePublicHotServing(result);
    expect(unreachable.intelligence_hot_snapshot_ready).toBe(false);
    expect(unreachable.current_scored_domain_coverage.status)
      .toBe("NOT_ASSESSED_BY_HOT_SERVING_DIAGNOSTIC");
    expect(result.failure_codes).toContain("D1_CONTROL_PLANE_UNAVAILABLE");
    expect(result.failure_codes).toContain("D1_PUBLIC_HOT_SNAPSHOT_UNAVAILABLE");
    expect(result.failure_codes).toContain("PUBLIC_SITE_TRANSPORT_UNAVAILABLE");
    expect(JSON.stringify(result)).not.toContain("BLOCK_THIS");
  });

  it("never uses B2/SQL or x402 and only reaches fixed public HTTPS origins",()=>{
    const s=readFileSync("scripts/ops/diagnose-public-hot-serving.mjs","utf8");
    expect(s).toContain('const SITE_URL = "https://geomacro.live"');
    expect(s).toContain('const D1_URL = "https://geomacro-control-plane.daspallab202391.workers.dev"');
    expect(s).not.toContain("B2_APPLICATION_KEY");
    expect(s).not.toContain("GEOMACRO_COMMERCE_LEDGER_TOKEN");
    expect(s).not.toContain("paymentAuthorization");
    expect(s).not.toContain("method:\"POST\"");
    expect(s).not.toContain("method:\"PUT\"");
  });
});
