import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { observeApprovedReliefWeb } from "../../scripts/ops/observe-approved-reliefweb-live.mjs";

const now=new Date("2026-10-12T12:00:00.000Z");
const approved="geomacro-humanitarian-risk-6b293f";
const item=(id:string,date:string,iso:string)=>({
  id,fields:{date:{original:date},country:[{iso3:iso}],source:[{name:"An original partner"}],
    title:"Raw original partner text MUST NOT survive in aggregate"}
});

describe("approved ReliefWeb live private observer",()=>{
  it("returns blocked status and consumes zero calls until exact approval is installed",async()=>{
    for(const name of ["","geomacro.live","abcd","wrong space","with/slash"]){
      const f=vi.fn();
      const result=await observeApprovedReliefWeb({appname:name,now,fetchImpl:f});
      expect(result.status).toBe("CONFIG_REQUIRED");
      expect(result.api_requests).toBe(0);
      expect(result.commercial_eligible).toBe(false);
      expect(f).not.toHaveBeenCalled();
    }
  });
  it("fetches one metadata-only API page and reports truthful source-native freshness",async()=>{
    const f=vi.fn(async(uri:string,opts:any)=>{
      const u=new URL(uri);
      expect(u.origin).toBe("https://api.reliefweb.int");
      expect(u.pathname).toBe("/v2/reports");
      expect(u.searchParams.get("appname")).toBe(approved);
      expect(opts.method).toBe("POST");
      expect(opts.redirect).toBe("error");
      const body=JSON.parse(opts.body);
      expect(body.preset).toBe("latest");
      expect(body.limit).toBe(80);
      expect(JSON.stringify(body)).not.toContain("body");
      expect(body.fields.include).toContain("date.original");
      return Response.json({data:[
        item("1","2026-10-12T10:00:00Z","UKR"),
        item("2","2026-10-09T10:00:00Z","IND"),
        item("1","2026-10-12T10:00:00Z","UKR"),
        item("3","2026-10-12T18:00:00Z","CHN"),
      ]});
    });
    const r=await observeApprovedReliefWeb({appname:approved,now,fetchImpl:f as typeof fetch});
    expect(f).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({
      status:"LIVE_METADATA_TRANSPORT",api_requests:1,sampled_reports:3,
      reports_with_original_native_date:2,
      sampled_original_reports_within_24h:1,
      sampled_distinct_countries:3,
      observed_domain:"geopolitics",
      original_report_date_is_not_publisher_page_proof:true,
      independent_original_publisher_verified:false,
      current_scored_intelligence_verified:false,
      publisher_rights_verified:false,commercial_eligible:false,
      raw_report_bodies_stored:false,supabase_requests:0,b2_requests:0,d1_requests:0,usdc_spent:0,
    });
    expect(JSON.stringify(r)).not.toContain(approved);
    expect(JSON.stringify(r)).not.toContain("Raw original partner text");
  });
  it("does not retry provider 403/429 or mislabel denied access as activated",async()=>{
    for(const status of [401,403,429]){
      const f=vi.fn(async()=>new Response(null,{status}));
      const r=await observeApprovedReliefWeb({appname:approved,now,fetchImpl:f});
      expect(f).toHaveBeenCalledTimes(1);
      expect(r.status).toBe("ACCESS_DENIED_OR_QUOTA");
      expect(r.api_requests).toBe(1);
      expect(r.commercial_eligible).toBe(false);
    }
  });
  it("rejects malformed and oversized API replies without publishing",async()=>{
    const invalid=vi.fn(async()=>Response.json({data:{not:"an array"}}));
    await expect(observeApprovedReliefWeb({appname:approved,now,fetchImpl:invalid}))
      .rejects.toThrow("RELIEFWEB_APPROVED_RESPONSE_SHAPE_INVALID");
    const huge=vi.fn(async()=>new Response("x",{
      headers:{"content-length":"1000000000"}
    }));
    await expect(observeApprovedReliefWeb({appname:approved,now,fetchImpl:huge}))
      .rejects.toThrow("RELIEFWEB_APPROVED_RESPONSE_TOO_LARGE");
  });
  it("adds an approval-gated metadata reader to the existing three-domain schedule, not a new writer",()=>{
    const flow=readFileSync(".github/workflows/expanded-official-source-observation.yml","utf8");
    const onDemand=readFileSync("src/lib/on-demand-global-discovery.server.ts","utf8");
    const legacy=readFileSync(".github/workflows/ingest-reliefweb-live.yml","utf8");
    expect(flow).toContain("approved-reliefweb-live:");
    expect(flow).toContain('RELIEFWEB_APPROVED_APPNAME: ${{ secrets.RELIEFWEB_APPROVED_APPNAME }}');
    expect(flow).toContain("observe-approved-reliefweb-live.mjs");
    expect(flow).toContain('cron: "17 0,3,6,9,12,15,18,21 * * *"');
    expect(flow).toContain('cron: "47 1,4,7,10,13,16,19,22 * * *"');
    expect(onDemand).toContain("process.env.RELIEFWEB_APPROVED_APPNAME");
    expect(flow).not.toContain("scripts/ingest-reliefweb-live.mjs");
    expect(legacy).not.toContain("schedule:");
    expect(flow).toContain("read-only-country-matrix:");
  });
});
