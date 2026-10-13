import {describe,it,expect,vi} from "vitest";
import {readFileSync} from "node:fs";
import {
  observeQuarantinedRssRecovery,QUARANTINED_RSS_CANARIES,
} from "../../scripts/ops/observe-quarantined-official-rss-canary.mjs";
const now=new Date("2026-10-13T12:00:00Z");
const rss=`<?xml version="1.0"?><rss version="2.0"><channel>
<item><title>Old reviewed first-party item</title>
<pubDate>Thu, 08 Oct 2026 12:00:00 GMT</pubDate></item>
</channel></rss>`;
const stub=(status:number,content=rss,type="application/rss+xml")=>
  vi.fn(async()=>new Response(status===200?content:null,
    {status,headers:{"content-type":type}})) as typeof fetch;
describe("#2042 safely retry only two earlier transport-unavailable official RSS routes",()=>{
  it("fixed pinned publisher URLs and 2 GETs, no previously denied EITI",async()=>{
    expect(QUARANTINED_RSS_CANARIES).toHaveLength(2);
    expect(QUARANTINED_RSS_CANARIES.map(x=>x.id))
      .not.toContain("eiti_implementing_country_official_api_review");
    const mock=stub(200);
    const r=await observeQuarantinedRssRecovery({fetchImpl:mock,now});
    expect(mock).toHaveBeenCalledTimes(2);
    expect(r.recovered_readable_xml_rss_transport_count).toBe(2);
    expect(r.current_native_first_published_events_verified).toBe(false);
    expect(r.all_quarantines_unblocked).toBe(false);
    expect(r.eiti_403_source_retried).toBe(false);
    expect(r.payment_authorized).toBe(false);
    expect(r.commercial_eligible).toBe(false);
    expect(r.observations.every(x=>x.automatic_unquarantine_performed===false))
      .toBe(true);
    for(const line of JSON.stringify(r).split("\n")){
      for(const forbidden of ["natural-resources.canada.ca","www.usgs.gov",
        "Old reviewed first-party item"])
        expect(line).not.toContain(forbidden);
    }
  });
  it("fails closed on 403, 429, unsupported MIME and HTML error body",async()=>{
    for(const [code,content,type,status] of [
      [403,"","application/rss+xml","AUTH_OR_RATE_LIMIT_DENIED"],
      [429,"","application/rss+xml","AUTH_OR_RATE_LIMIT_DENIED"],
      [200,"<html>redirected access denied</html>","text/html","RSS_MIME_NOT_VERIFIED"],
      [200,"<html><rss>fake XML</rss></html>","application/rss+xml","RSS_XML_ROOT_INVALID"],
      [200,"<rss><channel></channel></rss>","application/rss+xml","RSS_VALID_EMPTY_NO_ORIGINALS"],
    ] as const){
      const r=await observeQuarantinedRssRecovery({
        fetchImpl:stub(code,content,type),now,
      });
      expect(r.observations.every(x=>x.status===status)).toBe(true);
      expect(r.recovered_readable_xml_rss_transport_count).toBe(0);
      expect(r.payment_authorized).toBe(false);
    }
  });
  it("has no unapproved producer host, raw feed storage, B2/Supabase x402 or automatic unquarantine",()=>{
    const flow=readFileSync(".github/workflows/quarantined-official-rss-canary.yml","utf8");
    const src=readFileSync("scripts/ops/observe-quarantined-official-rss-canary.mjs","utf8");
    expect(flow).toContain('cron: "31 7 * * 1"');
    expect(flow).toContain("retention-days: 2");
    expect(src).toContain("isQuarantinedOfficialRoute");
    expect(src).toContain("automatic_unquarantine_performed:false");
    for(const banned of ["eiti.org/api","settleCoinbaseX402",
      "SUPABASE_DB_URL","B2_APPLICATION_KEY","D1.prepare"])
      expect(src).not.toContain(banned);
  });
});
