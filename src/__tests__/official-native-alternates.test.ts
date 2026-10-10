import { describe, expect, it, vi } from "vitest";
import { OFFICIAL_NATIVE_FEEDS, fetchOfficialNativeArticles } from "../../scripts/lib/official-native-rss.mjs";
import { ORIGINAL_PUBLISHER_ALTERNATES, parseOfficialAlternate, fetchOriginalAlternate }
  from "../../scripts/lib/official-native-alternates.mjs";

const now = new Date("2026-10-09T13:30:00.000Z");
const atom = (title: string, url: string, date: string) =>
  `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom">
     <updated>2026-10-09T13:29:00Z</updated>
     <entry><title>${title}</title><link rel="alternate" href="${url}"/>
     <published>${date}</published></entry></feed>`;

const title = "Canada announces funding for critical minerals lithium refining and rare earth processing";
const uri = "https://www.canada.ca/en/natural-resources-canada/news/2026/10/critical-minerals.html";

describe("original publisher alternate feed with source-native Atom dates", () => {
  it("rejects two-minute future native Atom publication without accepting clock skew", () => {
    const stats: Record<string, number> = {};
    const future = atom(title, uri, "2026-10-09T13:32:00Z");
    expect(parseOfficialAlternate(future, "rare_earth", now, stats)).toEqual([]);
    expect(stats.alternate_native_date_items).toBe(1);
    expect(stats.alternate_native_current_items).toBe(0);
    expect(stats.alternate_admitted_private_count).toBe(0);
    expect(parseOfficialAlternate(atom(title, uri, "2026-10-09T13:30:00Z"),
      "rare_earth", now)).toHaveLength(1);
  });

  it("admits Canadian mineral-news ORIGINAL Atom published time only as private", () => {
    const stats: Record<string, number> = {};
    const result = parseOfficialAlternate(atom(title, uri, "2026-10-09T12:15:00Z"),
      "rare_earth", now, stats);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      url: uri, sourceDomain: "www.canada.ca",
      publishedAt: "2026-10-09T12:15:00.000Z",
      nativeTimeEvidence: "publisher_atom_entry_published",
      rightsVerified: false, commercialEligible: false,
      privateOnly: true, nativePublishedAtVerified: true,
    });
    expect(result[0]).not.toHaveProperty("severity");
    expect(stats.alternate_admitted_private_count).toBe(1);
    expect(stats.alternate_native_current_items).toBe(1);
  });
  it("rejects updated-only entries, old, future, cross-host, and unrelated news", () => {
    const emptyDate = atom(title, uri, "").replace("<published></published>", "");
    expect(parseOfficialAlternate(emptyDate, "rare_earth", now)).toEqual([]);
    expect(parseOfficialAlternate(atom(title, uri, "2026-10-05T12:15:00Z"),
      "rare_earth", now)).toEqual([]);
    expect(parseOfficialAlternate(atom(title, uri, "2026-10-10T12:15:00Z"),
      "rare_earth", now)).toEqual([]);
    expect(parseOfficialAlternate(atom(title, "https://canada.ca.evil.test/uri",
      "2026-10-09T12:15:00Z"), "rare_earth", now)).toEqual([]);
    expect(parseOfficialAlternate(atom("Local school vegetable garden wins prize", uri,
      "2026-10-09T12:15:00Z"), "rare_earth", now)).toEqual([]);
  });
  it("probes and admits only fixed government source URL without redirects", async () => {
    const xml = atom(title, uri, "2026-10-09T12:15:00Z");
    const fetchImpl = vi.fn(async () => Response.json({}, { status: 404 }));
    fetchImpl.mockImplementationOnce(async () => new Response("<rss><channel></channel></rss>",
      { headers: { "content-type": "application/rss+xml" } }));
    fetchImpl.mockImplementationOnce(async () => new Response(xml,
      { headers: { "content-type": "application/atom+xml" } }));
    const diagnostics: Record<string, unknown> = {};
    const result = await fetchOfficialNativeArticles("rare_earth", {
      now, fetchImpl, diagnostics,
    });
    expect(result).toHaveLength(1);
    expect(diagnostics.primary_feed_ok).toBe(true);
    expect(diagnostics.alternate_feed_ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][0]).toBe(OFFICIAL_NATIVE_FEEDS.rare_earth.url);
    expect(fetchImpl.mock.calls[1][0]).toBe(ORIGINAL_PUBLISHER_ALTERNATES.rare_earth.url);
    expect((fetchImpl.mock.calls[1][1] as RequestInit).redirect).toBe("error");
  });
  it("UN global and StatCan original entries have correct independent fixed host", () => {
    const unXml = `<rss version="2.0"><channel><item><title>
       UN Security Council responds to new border conflict with calls for ceasefire
       </title><link>https://news.un.org/en/story/2026/10/1111</link>
       <pubDate>Fri, 09 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>`;
    expect(parseOfficialAlternate(unXml, "geopolitics", now)).toHaveLength(1);
    const ca = atom("Consumer price inflation accelerates in September in Canada",
      "https://www150.statcan.gc.ca/n1/daily-quotidien/261009/abc-eng.htm",
      "2026-10-09T12:15:00Z");
    expect(parseOfficialAlternate(ca, "macro", now)).toHaveLength(1);
  });
  it("accepts only exact-rooted StatCan Daily Atom href as a trusted original article path",()=>{
    const headline="Consumer price inflation accelerates in September in Canada";
    const relative="/n1/daily-quotidien/261009/abc-eng.htm";
    const counts:Record<string,number>={};
    const rows=parseOfficialAlternate(
      atom(headline,relative,"2026-10-09T12:15:00Z"),"macro",now,counts);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      url:"https://www150.statcan.gc.ca"+relative,
      sourceDomain:"www150.statcan.gc.ca",
      publishedAt:"2026-10-09T12:15:00.000Z",
      nativeTimeEvidence:"publisher_atom_entry_published",
      privateOnly:true,rightsVerified:false,commercialEligible:false,
    });
    expect(counts.alternate_statcan_exact_root_relative_items).toBe(1);
    expect(counts.alternate_other_relative_href_rejected_items).toBe(0);
    for(const unsafe of [
      "//www150.statcan.gc.ca/n1/daily-quotidien/261009/abc-eng.htm",
      "/n1/daily-quotidien/261009/../abc-eng.htm",
      "/n1/daily-quotidien/261009/abc-eng.htm?next=evil.example",
      "/n1/daily-quotidien/261009/%2e%2e%2fsecret.htm",
      "/n1/daily-quotidien/261009/ABC-eng.htm",
      "/random/daily-report.htm",
      "https://www150.statcan.gc.ca.evil.example/n1/daily-quotidien/261009/abc-eng.htm",
    ]) {
      expect(parseOfficialAlternate(
        atom(headline,unsafe,"2026-10-09T12:15:00Z"),"macro",now))
        .toHaveLength(0);
    }
  });

  it("hydrates StatCan updated-only relative link only with precise original article date",async()=>{
    const relative="/n1/daily-quotidien/261009/abc-eng.htm";
    const headline="Consumer price inflation accelerates in September in Canada";
    const xml=atom(headline,relative,"").replace("<published></published>","");
    const article='<html><head><meta property="article:published_time" content="2026-10-09T12:15:00Z"></head></html>';
    const urls:string[]=[];
    const fetchImpl=vi.fn(async (u:string)=>{
      urls.push(u);
      if(u===ORIGINAL_PUBLISHER_ALTERNATES.macro.url)
        return new Response(xml,{headers:{"content-type":"application/atom+xml"}});
      if(u==="https://www150.statcan.gc.ca"+relative)
        return new Response(article,{headers:{"content-type":"text/html"}});
      throw Error("NO_THIRD_PARTY_OR_REDIRECT_ALLOWED");
    });
    const diagnostics:Record<string,number>={};
    const rows=await fetchOriginalAlternate("macro",{now,fetchImpl,diagnostics});
    expect(urls).toEqual([
      ORIGINAL_PUBLISHER_ALTERNATES.macro.url,
      "https://www150.statcan.gc.ca"+relative,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      url:"https://www150.statcan.gc.ca"+relative,
      publishedAt:"2026-10-09T12:15:00.000Z",
      nativeTimeEvidence:"publisher_original_article_datePublished",
      privateOnly:true,rightsVerified:false,commercialEligible:false,
    });
    expect(diagnostics.alternate_article_page_probes).toBe(1);
    expect(diagnostics.alternate_article_page_admitted).toBe(1);
    expect(diagnostics.alternate_statcan_exact_root_relative_items).toBe(1);
    expect(rows[0]).not.toHaveProperty("severity");
  });

  it("counts original Atom tag formats without using metadata-only dates for admission", () => {
    const updateOnly = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:dc="http://purl.org/dc/elements/1.1/"
      xmlns:dcterms="http://purl.org/dc/terms/">
      <entry><title>${title}</title><link rel="alternate" href="${uri}"/>
      <updated>2026-10-09T13:29:00Z</updated>
      <dc:date>2026-10-09T12:00:00Z</dc:date>
      <dcterms:issued>2026-10-09T12:00:00Z</dcterms:issued></entry></feed>`;
    const diagnostics: Record<string, number> = {};
    expect(parseOfficialAlternate(updateOnly, "rare_earth", now, diagnostics)).toEqual([]);
    expect(diagnostics).toMatchObject({
      alternate_feed_items_seen: 1,
      alternate_native_date_items: 0,
      alternate_admitted_private_count: 0,
      alternate_atom_published_tag_items: 0,
      alternate_atom_updated_only_items: 1,
      alternate_atom_dc_date_tag_items: 1,
      alternate_atom_dcterms_issued_tag_items: 1,
      alternate_atom_link_href_items: 1,
    });
    expect(JSON.stringify(diagnostics)).not.toContain(uri);
    expect(JSON.stringify(diagnostics)).not.toContain(title);
  });
  it("does not confuse a feed-level updated timestamp with entry original publication", () => {
    const updatedOnly = atom(title, uri, "").replace("<published></published>", "");
    const stats: Record<string, number> = {};
    expect(parseOfficialAlternate(updatedOnly, "rare_earth", now, stats)).toEqual([]);
    expect(stats.alternate_atom_published_tag_items).toBe(0);
    expect(stats.alternate_atom_updated_only_items).toBe(0);
    expect(stats.alternate_admitted_private_count).toBe(0);
    const valid: Record<string, number> = {};
    expect(parseOfficialAlternate(atom(title, uri, "2026-10-09T12:15:00Z"),
      "rare_earth", now, valid)).toHaveLength(1);
    expect(valid.alternate_atom_published_tag_items).toBe(1);
    expect(valid.alternate_atom_updated_only_items).toBe(0);
  });
  it("not even successful alternate discovery grants public or paid source rights", async () => {
    const doc = atom(title, uri, "2026-10-09T12:15:00Z");
    const rows = await fetchOriginalAlternate("rare_earth", {
      now, fetchImpl: async () => new Response(doc, {
        headers: { "content-type": "application/atom+xml" },
      }),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].commercialEligible).toBe(false);
    expect(rows[0].rightsVerified).toBe(false);
    expect(JSON.stringify(rows)).not.toContain("payment_signature");
  });
});
