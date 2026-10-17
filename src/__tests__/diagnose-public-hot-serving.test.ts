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
        last_verified_baseline_readable:{intelligence:true,global_risk:true,risk_indices:true},
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
    if(url.endsWith("/v1/public/historical-continuity/global-risk"))
      return Response.json({
        ok:true,schema:"geomacro.public-global-risk-historical-continuity.v1",
        product:"global-risk",historical_only:true,
        current_snapshot_available:false,commercial_eligible:false,
        x402_chargeable:false,hot_freshness_not_asserted:true,
        source_news_freshness_not_asserted:true,
        independently_verified_archive_at_past_write:true,
        independently_rechecked_b2_now:false,
        anchor_kind:"direct_verified_b2_snapshot",
        original_snapshot_as_of:recent,archive_generated_at:recent,
      });
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
    expect(calls).toHaveLength(6);
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
    expect(result.historical_global_risk).toMatchObject({
      anchor_valid_in_d1:true,historical_only:true,
      b2_archive_readback_now_verified:false,
      current_product_verified:false,commercial_eligible:false,
    });
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

  it("does not hide a known unreadable B2 baseline behind otherwise healthy D1 snapshots",async()=>{
    const {fetchImpl}=fakeFetch();
    const altered=async(url:string,options:Record<string,any>)=>{
      const result=await fetchImpl(url,options);
      if(url.includes("/api/health?deep=1")){
        const body=await result.json();
        body.public_production.last_verified_baseline_readable.global_risk=false;
        return Response.json(body,{status:200});
      }
      return result;
    };
    const receipt=await diagnosePublicHotServing({fetchImpl:altered,nowMs:NOW});
    expect(receipt.ok).toBe(false);
    expect(receipt.failure_codes).toContain("HISTORICAL_B2_BASELINE_PROOF_UNREADABLE");
    expect(receipt.site.historical_b2_baseline_readable).toMatchObject({
      intelligence:true,global_risk:false,risk_indices:true,
    });
    expect(receipt.commercial_eligibility_verified).toBe(false);
    expect(receipt.historical_global_risk.anchor_valid_in_d1).toBe(true);
    expect(receipt.historical_global_risk.b2_archive_readback_now_verified).toBe(false);
    expect(receipt.failure_codes).toContain("GRI_D1_ARCHIVE_ANCHOR_VALID_BUT_PUBLIC_BASELINE_READ_UNAVAILABLE");
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

  it("separately flags an unavailable Global Risk historical D1 archive anchor without promoting stale data",async()=>{
    const {fetchImpl}=fakeFetch({siteStatus:503,failProduct:"global-risk"});
    const readOnly=async(url:string,options:Record<string,any>)=>{
      if(url.endsWith("/v1/public/historical-continuity/global-risk"))
        return Response.json({
          ok:false,error:"GLOBAL_RISK_VERIFIED_ARCHIVE_UNAVAILABLE",
        },{status:503});
      if(url.includes("/api/health?deep=1")){
        const response=await fetchImpl(url,options);
        const data=await response.json();
        data.public_production.last_verified_baseline_readable.global_risk=false;
        return Response.json(data,{status:503});
      }
      return fetchImpl(url,options);
    };
    const result=await diagnosePublicHotServing({fetchImpl:readOnly,nowMs:NOW});
    expect(result.ok).toBe(false);
    expect(result.failure_codes).toContain("GRI_HISTORICAL_D1_ARCHIVE_ANCHOR_UNAVAILABLE_OR_INVALID");
    expect(result.historical_global_risk).toMatchObject({
      http_status:503,anchor_valid_in_d1:false,
      error:"GLOBAL_RISK_VERIFIED_ARCHIVE_UNAVAILABLE",
      b2_archive_readback_now_verified:false,
      current_product_verified:false,
    });
    expect(JSON.stringify(result)).not.toContain("source_url");
    expect(result.b2_private_archive_reads).toBe(0);
    expect(result.external_payment_performed).toBe(false);
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
