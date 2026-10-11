import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseOfficialNativeRss } from "../../scripts/lib/official-native-rss.mjs";
import { parseOfficialAlternate } from "../../scripts/lib/official-native-alternates.mjs";
import { parseOfficialThirdRss } from "../../scripts/lib/official-native-third-fallback.mjs";

const now = new Date("2026-10-11T06:00:00.000Z");
const date = "Sun, 11 Oct 2026 05:30:00 GMT";
const irrelevantTitle = "Official public service departmental operations announcement";
const rss=(url: string, at=date)=>`<rss version="2.0"><channel><item>
  <title>${irrelevantTitle}</title><link>${url}</link><pubDate>${at}</pubDate>
</item></channel></rss>`;
const atom=(url:string,at="2026-10-11T05:30:00Z")=>`<feed><entry>
  <title>${irrelevantTitle}</title><link rel="alternate" href="${url}"/>
  <published>${at}</published></entry></feed>`;

describe("#1827 source-intake minimum gates (PRIVATE discovery only)",()=>{
  it.each([
    ["geopolitics","news.un.org"],
    ["macro","www.federalreserve.gov"],
    ["rare_earth","www.usgs.gov"],
  ])("%s source headline keyword miss no longer blocks an authentic, dated original from PRIVATE discovery", (domain,host)=>{
    const url=`https://${host}/news/original-item`;
    expect(parseOfficialNativeRss(rss(url),domain,now)).toHaveLength(0);
    const rows=parseOfficialNativeRss(rss(url),domain,now,24*3600_000,null,true);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      url,publishedAt:"2026-10-11T05:30:00.000Z",
      privateOnly:true,nativePublishedAtVerified:true,rightsVerified:false,
      commercialEligible:false,
    });
    expect(rows[0]).not.toHaveProperty("severity");
    expect(parseOfficialNativeRss(rss(`https://${host}.evil.test/x`),
      domain,now,24*3600_000,null,true)).toEqual([]);
    expect(parseOfficialNativeRss(rss(url,"Sun, 11 Oct 2026 06:01:00 GMT"),
      domain,now,24*3600_000,null,true)).toEqual([]);
  });

  it("official alternate mineral Atom can stage a non-keyword private original, never an undated/forged item",()=>{
    const url="https://www.canada.ca/en/natural-resources-canada/news/2026/10/example.html";
    expect(parseOfficialAlternate(atom(url),"rare_earth",now)).toEqual([]);
    const rows=parseOfficialAlternate(atom(url),"rare_earth",now,null,24*3600_000,true);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      nativeTimeEvidence:"publisher_atom_entry_published",
      privateOnly:true,rightsVerified:false,commercialEligible:false,
    });
    expect(parseOfficialAlternate(atom("https://www.canada.ca.evil.test/test"),
      "rare_earth",now,null,24*3600_000,true)).toEqual([]);
    expect(parseOfficialAlternate(atom(url,""),"rare_earth",now,null,24*3600_000,true)).toEqual([]);
  });

  it("third official ECB RSS intake defers headline keyword choice to private classification",()=>{
    const url="https://www.ecb.europa.eu/press/pr/date/2026/html/example.en.html";
    expect(parseOfficialThirdRss(rss(url),"macro",{now})).toEqual([]);
    const rows=parseOfficialThirdRss(rss(url),"macro",{
      now,maxAgeMs:24*3600_000,broadPrivateIntake:true,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({privateOnly:true,
      nativePublishedAtVerified:true,rightsVerified:false,commercialEligible:false});
    expect(parseOfficialThirdRss(rss("https://www.ecb.europa.eu.evil.test/test"),
      "macro",{now,broadPrivateIntake:true})).toEqual([]);
  });

  it("only explicitly opt-in private scorer bypasses pre-classifier keyword rejection, never paid gates",()=>{
    const ingest=readFileSync("scripts/ingest-news.js","utf8");
    expect(ingest).toContain("broadPrivateIntake: true");
    expect(ingest).toContain("requireOriginalPublisherProof: true");
    expect(ingest).toContain("const gated = passesGates(article, assessment, category.name)");
    expect(ingest).toContain("if (!PRIVATE_B2_STAGE && !ALLOW[category]?.test(blob))");
    expect(ingest).toContain("if (!assessment.relevant)");
    expect(ingest).toContain("Number(assessment.confidence) < MIN_CONFIDENCE");
    expect(ingest).toContain("Number(assessment.severity) < MIN_SEVERITY");
    expect(ingest).toContain("privatePublisherPreAdmission(article,");
    expect(ingest).toContain("if (DENY.test(article.title) ||");
    expect(ingest).not.toContain("!ALLOW[category.name]?.test(article.title)");
    for(const file of ["scripts/lib/official-native-rss.mjs",
      "scripts/lib/official-native-alternates.mjs",
      "scripts/lib/official-native-third-fallback.mjs"]){
      const source=readFileSync(file,"utf8");
      expect(source).toContain("broadPrivateIntake");
      expect(source).toContain("commercialEligible:false");
    }
  });
});
