import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {websitePublicCutoff} from "../lib/website-publication-delay";

const source=readFileSync("src/routes/api.public-data-proxy.ts","utf8");
const now=Date.parse("2026-10-12T12:00:00Z");

describe("legacy website-only public PostgREST risk data embargo",()=>{
  it("uses exactly the same verified 60min cutoff as GRI and Intelligence pages",()=>{
    expect(new Date(websitePublicCutoff(now)).toISOString())
      .toBe("2026-10-12T11:00:00.000Z");
    expect(source).toContain("const cutoff=new Date(websitePublicCutoff()).toISOString()");
    expect(source).toContain('if(table==="events")');
    expect(source).toContain('upstream.searchParams.set("published_at","lte."+cutoff)');
    expect(source).toContain('upstream.searchParams.set("created_at","lte."+cutoff)');
    expect(source).toContain('if(table==="gri_snapshots")');
    expect(source).toContain('upstream.searchParams.set("as_of","lte."+cutoff)');
    expect(source).toContain('upstream.searchParams.set("status","eq.published")');
    expect(source).toContain('upstream.searchParams.set("verification_status","eq.verified")');
  });
  it("does not trust caller-controlled duplicate date expressions that could bypass website hold",()=>{
    expect(source).toContain('upstream.searchParams.has("published_at")');
    expect(source).toContain('upstream.searchParams.has("created_at")');
    expect(source).toContain('upstream.searchParams.has("as_of")');
    expect(source).toContain("Website event date filters are server-controlled");
    expect(source).toContain("Website GRI snapshot date is server-controlled");
  });
  it("requires bounded prior verified parent for GRI proof child tables",()=>{
    expect(source).toContain('table==="gri_contributions"||table==="gri_source_dispositions"');
    expect(source).toContain('upstream.searchParams.getAll("snapshot_id")');
    expect(source).toContain('parent.searchParams.set("id","eq."+id)');
    expect(source).toContain('parent.searchParams.set("as_of","lte."+cutoff)');
    expect(source).toContain('parent.searchParams.set("verification_status","eq.verified")');
    expect(source).toContain('parent.searchParams.set("status","eq.published")');
    expect(source).toContain('parent.searchParams.set("limit","1")');
    expect(source).toContain("AbortSignal.timeout(4000)");
    expect(source).toContain("Historical GRI parent proof unavailable");
    expect(source).toContain('!Number.isFinite(Date.parse(String(body[0]?.as_of??"")))');
    expect(source).toContain('return bad(403,"GRI snapshot is not yet website-public")');
  });
  it("never delays independent live machine x402 routes or sells a synthetic score",()=>{
    const machine=readFileSync("src/lib/mainnet-intelligence-endpoint.server.ts","utf8");
    const signer=readFileSync("src/lib/production-global-risk.server.ts","utf8");
    expect(machine).not.toContain("websitePublicCutoff");
    expect(machine).not.toContain("WEBSITE_RELEASE_DELAY_MS");
    expect(signer).not.toContain("websitePublicCutoff");
    expect(source).not.toContain("APP_SUPABASE_SERVICE_ROLE_KEY");
    expect(source).toContain("redactPrivateSourceIdentity(parsedBody)");
    expect(source).toContain("safePostgrestAccept");
  });
});
