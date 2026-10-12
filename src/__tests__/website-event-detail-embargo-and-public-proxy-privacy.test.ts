import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {websiteEvidencePastEmbargo} from "../lib/website-publication-delay";
import {
  plainPublicProjection,hasPrivateSourceQueryFilter,safePostgrestAccept,
} from "../lib/public-postgrest-proxy-privacy";

const now=Date.parse("2026-10-12T12:00:00.000Z");
const iso=(minutes:number)=>new Date(now+minutes*60_000).toISOString();

describe("website event pages cannot bypass the one-hour source/evidence embargo",()=>{
  it("accepts exactly 60-minute-old original+recorded evidence but blocks under-one-hour, future or unknown",()=>{
    const old={published_at:iso(-60),created_at:iso(-60)};
    expect(websiteEvidencePastEmbargo(old,now)).toBe(true);
    expect(websiteEvidencePastEmbargo({...old,published_at:iso(-59)},now)).toBe(false);
    expect(websiteEvidencePastEmbargo({...old,created_at:iso(-59)},now)).toBe(false);
    expect(websiteEvidencePastEmbargo({...old,published_at:null},now)).toBe(false);
    expect(websiteEvidencePastEmbargo({...old,published_at:iso(8)},now)).toBe(false);
  });
  it("enforces the same hold on interactive event details and public SEO SSR metadata",()=>{
    for(const path of [
      "src/lib/public-event.functions.ts",
      "src/lib/public-event-seo.functions.ts",
    ]){
      const c=readFileSync(path,"utf8");
      expect(c).toContain("websiteEvidencePastEmbargo(safe)");
      expect(c).toContain("sanitizePublicIntelligenceRow");
      expect(c).toContain("readB2PublicIntelligence");
      expect(c).not.toContain("source_url: row.source_url");
    }
    const machine=readFileSync("src/lib/mainnet-intelligence-endpoint.server.ts","utf8");
    expect(machine).not.toContain("websiteEvidencePastEmbargo");
    expect(machine).not.toContain("WEBSITE_RELEASE_DELAY_MS");
  });
});

describe("generic public data proxy cannot bypass source privacy by alias, filter or CSV",()=>{
  it("accepts only explicit PostgREST simple column names, rejecting aliases and embedded extraction",()=>{
    for(const select of [
      "id,as_of,proof_hash",
      "source_name,source_domain",
      "snapshot_id,contribution_points",
      null,
    ])expect(plainPublicProjection(select)).toBe(true);
    for(const select of [
      "*",
      "label:source_name",
      "source_name::text",
      "source_name->>url",
      "evidence(derived_data)",
      "id,secret:source_url",
      "gri_source_dispositions(*)",
      "source_name,",
      "",
      "id%2csource_name",
    ])expect(plainPublicProjection(select)).toBe(false);
  });
  it("rejects filtering source identities and nested privacy fields even if the response contains no source key",()=>{
    const bad=[
      "source_name=eq.SomeCorp",
      "source_key=eq.private",
      "source_url=not.is.null",
      "provider_name=eq.Institution",
      "publisher=eq.name",
      "raw_content=is.not.null",
      "meta.source_name=eq.hidden",
      "or=%28source_name.eq.test%29",
      "and=%28source_name.eq.test%29",
    ];
    for(const q of bad)expect(hasPrivateSourceQueryFilter(new URLSearchParams(q))).toBe(true);
    for(const q of [
      "select=id,as_of&status=eq.published&methodology_version=eq.gri-v1.2.0",
      "snapshot_id=eq.123&order=contribution_points.desc",
      "validation_run_id=eq.123&limit=3",
      "raw_score=not.is.null&as_of=lte.2026-10-12",
    ])expect(hasPrivateSourceQueryFilter(new URLSearchParams(q))).toBe(false);
  });
  it("accepts strict JSON and PostgREST maybeSingle() JSON; suppresses CSV, XML and arbitrary vendor formats",()=>{
    expect(safePostgrestAccept("application/vnd.pgrst.object+json"))
      .toBe("application/vnd.pgrst.object+json");
    for(const s of [null,"text/csv","application/xml","application/vnd.pgrst.array+json","text/plain"])
      expect(safePostgrestAccept(s)).toBe("application/json");
    const proxy=readFileSync("src/routes/api.public-data-proxy.ts","utf8");
    expect(proxy).toContain("plainPublicProjection(select)");
    expect(proxy).toContain("hasPrivateSourceQueryFilter(parsed.searchParams)");
    expect(proxy).toContain('accept: safePostgrestAccept(request.headers.get("accept"))');
    expect(proxy).toContain("Public data backend did not return safe JSON");
    expect(proxy).toContain("redactPrivateSourceIdentity(parsedBody)");
    expect(proxy).toContain('"source_key"');
    expect(proxy).not.toContain("new Response(response.body");
  });
});
