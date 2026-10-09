import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  verifyIntelligenceWorkerB2D1Deployment,
} from "../../scripts/lib/intelligence-edge-b2-d1-deploy-proof.mjs";
import {
  probeWorkerDeploy,
  verifyWorkerDeployment,
} from "../../scripts/ops/verify-intelligence-edge-b2-d1-deploy.mjs";
import { summarizePublicIntelligenceFreshness } from "../../scripts/lib/public-intelligence-freshness-audit.mjs";

const NOW=Date.parse("2026-10-09T20:20:18.000Z");
const generated="2026-10-09T19:29:34.735Z";
const batch="2026-10-09T18:45:00.000Z";
const originalB2="2026-10-09T19:29:34.735Z";
const hashA="a".repeat(64);
const hist="2026-10-05T19:00:00.000Z";
const CATEGORIES=["geopolitics","macro","rare_earth"];

function fixture() {
  const observations=[{
    id:"verified-obs-1",
    source_title:"Geomacro observes conflict activity in a monitored border area",
    summary:"Governed timestamped unscored derived observation only.",
    category:"geopolitics",severity:null,delta:null,
    created_at:batch,published_at:batch,public_status:"live_observed",
  }];
  const scored=CATEGORIES.map((category,i)=>({
    id:"verified-scored-"+i,
    source_title:"Geomacro finds historical verified supply and macro risk context",
    summary:"Prior independently verified derived risk intelligence",
    category,severity:50+i*8,delta:null,
    created_at:hist,published_at:hist,public_status:"verified_b2",
  }));
  const overlayPayload={
    ok:true,
    schema:"geomacro.public-intelligence-live-observed.v1",
    generated_at:generated,
    source_id:"gdelt_v2_events",
    verified_b2_key:"geomacro-evidence/v1/live/public-intelligence/latest.json.gz",
    verified_b2_sha256:hashA,
    verified_b2_generated_at:originalB2,
    full_b2_readback_verified:true,
    exact_gzip_restore_verified:true,
    current_source_batch_at:batch,
    current_evidence_contract:"gdelt-v2-event-export-conflict-root-v1",
    raw_source_headlines_exposed:false,
    provider_identity_exposed:false,
    synthetic_score:false,
    rows:observations,
  };
  const edgePayload={
    schema:"geomacro.public-intelligence-live.v1",
    source_project:"ldpwajisioljyjtojvfx",
    generated_at:generated,
    current_overlay_authority:"cloudflare-d1-control-plane",
    current_overlay_source_batch_at:batch,
    current_evidence_contract:"gdelt-v2-event-export-conflict-root-v1",
    rows:[...observations.map(row=>({...row})),...scored],
  };
  return {
    edge:{
      status:200,authority:"backblaze-b2-intelligence-edge",
      current_overlay:"cloudflare-d1-hot",b2_sha256:hashA,
      payload:edgePayload,
    },
    overlay:{
      status:200,verified_b2_sha256:hashA,
      current_source_batch_at:batch,payload:overlayPayload,
    },
  };
}
const accept=(values=fixture(),now=NOW)=>
  verifyIntelligenceWorkerB2D1Deployment({...values,now});

describe("#1827 distinguish Intelligence Worker deploy from unpublished website",()=>{
  it("accepts real current D1 unscored observation overlay bound to exact prior B2 SHA, without claiming fresh scores",()=>{
    const input=fixture();
    const report=accept(input);
    expect(report).toMatchObject({
      ok:true,
      worker_deployed_with_b2_d1_current_overlay:true,
      edge_b2_hash_equals_d1_verified_anchor:true,
      current_source_observation_count:1,
      historical_scored_categories:CATEGORIES,
      observation_source_batch_at:batch,
      website_deployment_parity_checked:false,
      website_current_within_24h_not_asserted:true,
      three_domain_current_scored_ready_not_asserted:true,
      commercial_ready:false,
      signed_gro_coverage_not_asserted:true,
      source_rights_not_recertified:true,
      external_payment_performed:false,
      direct_b2_reads:0,supabase_reads:0,
    });
    // The strict independent site/scoring launch audit remains RED.
    const strict=summarizePublicIntelligenceFreshness({
      ...input,
      site:{status:200,payload:{
        ok:true,rows:input.edge.payload.rows.filter(r=>r.public_status==="verified_b2"),
        newest_at:hist,current_within_24h:false,
      }},
      now:NOW,
    });
    expect(strict.current_overlay_state).toBe("D1_CURRENT_OVERLAY_BOUND_TO_B2_VISIBLE");
    expect(strict.three_domain_current_scored_ready).toBe(false);
    expect(strict.commercial_payable_ready).toBe(false);
  });

  it("fails closed on B2/D1 SHA mismatch, absent projection or forged synthetic score",()=>{
    const alterations=[
      (o:any)=>{o.edge.b2_sha256="b".repeat(64);},
      (o:any)=>{o.overlay.payload.verified_b2_sha256="b".repeat(64);},
      (o:any)=>{o.overlay.verified_b2_sha256="b".repeat(64);},
      (o:any)=>{o.edge.current_overlay="none";},
      (o:any)=>{o.overlay.status=503;},
      (o:any)=>{o.overlay.payload.synthetic_score=true;},
      (o:any)=>{o.overlay.payload.full_b2_readback_verified=false;},
      (o:any)=>{o.overlay.payload.exact_gzip_restore_verified=false;},
      (o:any)=>{o.overlay.payload.raw_source_headlines_exposed=true;},
      (o:any)=>{o.overlay.payload.provider_identity_exposed=true;},
    ];
    for(const mutate of alterations){
      const o=fixture();mutate(o);
      expect(()=>accept(o)).toThrow(/^INTELLIGENCE_EDGE_DEPLOY_/);
    }
  });

  it("rejects forged current source dates, wrong source family or wrong sealed event contract",()=>{
    const changes=[
      (o:any)=>{o.overlay.payload.current_source_batch_at=hist;},
      (o:any)=>{o.edge.payload.current_overlay_source_batch_at=hist;},
      (o:any)=>{o.overlay.payload.source_id="untrusted_source";},
      (o:any)=>{o.overlay.payload.current_evidence_contract="untrusted";},
      (o:any)=>{o.edge.payload.current_overlay_authority="untrusted";},
      (o:any)=>{o.overlay.payload.rows[0].severity=91;},
      (o:any)=>{o.overlay.payload.rows[0].delta=2;},
      (o:any)=>{o.overlay.payload.rows[0].source_title="Raw source publisher headline";},
      (o:any)=>{o.overlay.payload.rows[0].source_url="https://example.org/private";},
      (o:any)=>{o.edge.payload.rows[0].id="not-the-overlay-observation";},
      (o:any)=>{o.edge.payload.rows[2].category="unknown";},
    ];
    for(const mutate of changes){
      const input=fixture();mutate(input);
      expect(()=>accept(input)).toThrow(/^INTELLIGENCE_EDGE_DEPLOY_/);
    }
  });

  it("requires one historically scored verified row per category without fabricating a CURRENT score",()=>{
    const x=fixture();
    x.edge.payload.rows=x.edge.payload.rows.filter(r=>r.category!=="macro");
    expect(()=>accept(x)).toThrow("INTELLIGENCE_EDGE_DEPLOY_VERIFIED_OVERLAY_INVALID");
    const y=fixture();
    y.edge.payload.rows[1].public_status="live_observed";
    expect(()=>accept(y)).toThrow("INTELLIGENCE_EDGE_DEPLOY_VERIFIED_OVERLAY_INVALID");
    const z=fixture();
    z.overlay.payload.rows[0].published_at=hist;
    expect(()=>accept(z)).toThrow("INTELLIGENCE_EDGE_DEPLOY_VERIFIED_OVERLAY_INVALID");
  });

  it("makes exactly two public read-only endpoint GETs on success, none to site or B2",async()=>{
    const values=fixture(),urls:string[]=[];
    const fetchImpl=vi.fn(async (url:string,options:RequestInit)=>{
      urls.push(url);
      expect(options.redirect).toBe("error");
      expect(options.method).toBe("GET");
      const edge=url.includes("geomacro-intelligence.");
      return Response.json(edge?values.edge.payload:values.overlay.payload,{
        status:200,
        headers:edge?{
          "x-geomacro-authority":"backblaze-b2-intelligence-edge",
          "x-geomacro-current-overlay":"cloudflare-d1-hot",
          "x-geomacro-b2-sha256":hashA,
        }:{},
      });
    });
    const report=await verifyWorkerDeployment({
      fetchImpl,sleep:async()=>{},now:()=>NOW,
    });
    expect(report.ok).toBe(true);
    expect(report.attempt).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    // Use exact full URL allowlisting: string substring matching may accept
    // malicious lookalike/suffixed hostnames. No website/B2 request is allowed.
    expect(urls).toEqual([
      "https://geomacro-intelligence.daspallab202391.workers.dev/intelligence",
      "https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/intelligence-overlay",
    ]);
  });

  it("never accepts unavailable old revision after bounded attempts",async()=>{
    const fail=vi.fn(async()=>Response.json({error:"stale"},{status:401}));
    await expect(verifyWorkerDeployment({
      fetchImpl:fail,sleep:async()=>{},now:()=>NOW,
    })).rejects.toThrow("INTELLIGENCE_EDGE_DEPLOY_B2_D1_NOT_CONVERGED");
    expect(fail).toHaveBeenCalledTimes(12);
  });

  it("keeps existing strict website and current original-source convergence gate unchanged",()=>{
    const deploy=readFileSync(".github/workflows/deploy-intelligence-edge.yml","utf8");
    const workerOnly=readFileSync("scripts/ops/verify-intelligence-edge-b2-d1-deploy.mjs","utf8");
    const strict=readFileSync("scripts/ops/verify-live-intelligence-overlay-convergence.mjs","utf8");
    const website=readFileSync(".github/workflows/production-website-health.yml","utf8");
    expect(deploy).toContain("verify-intelligence-edge-b2-d1-deploy.mjs");
    expect(deploy).not.toContain("verify-live-intelligence-overlay-convergence.mjs");
    expect(workerOnly).not.toContain("geomacro.live");
    expect(workerOnly).not.toContain("SUPABASE_DB_URL");
    expect(workerOnly).not.toContain("B2_APPLICATION_KEY");
    expect(strict).toContain("siteAsOf >= overlayBatch");
    expect(strict).toContain("site?.payload?.current_within_24h === true");
    expect(strict).toContain("INTELLIGENCE_EDGE_D1_B2_SITE_OVERLAY_NOT_CONVERGED");
    expect(website).toContain("Verify live build marker matches canonical main");
    expect(website).toContain("Verify public production APIs and current Intelligence contract");
    expect(website).toContain("LIVE_DEPLOYMENT_SHA_MISMATCH");
    expect(deploy).not.toContain("real_money_ack: true");
  });
});
