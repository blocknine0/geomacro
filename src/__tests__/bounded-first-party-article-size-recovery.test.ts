import {describe,expect,it,vi} from "vitest";
import {
  fetchVerifiedPublisherPageDate,verifiedPublisherPageDate,
} from "../../scripts/lib/official-original-article-date.mjs";

const now=new Date("2026-10-12T08:00:00.000Z");
const valid="https://www.gov.uk/government/news/foreign-secretary-regional-security-briefing";
const published='<html><head><meta name="govuk:first-published-at" '+
 'content="2026-10-12T07:41:00+00:00"></head><body>';
const bigHTML=published+"Official original article text ".repeat(7800)+"</body></html>";

describe("bounded original GOV.UK article HTML cap recovery",()=>{
 it("accepts a >128KiB normal original article with a precise real first-publication timestamp",async()=>{
  expect(Buffer.byteLength(bigHTML)).toBeGreaterThan(128*1024);
  expect(Buffer.byteLength(bigHTML)).toBeLessThan(384*1024);
  const fetchImpl=vi.fn(async()=>new Response(bigHTML,{
   headers:{"content-type":"text/html","content-length":String(Buffer.byteLength(bigHTML))},
  }));
  const diag:{code?:string;date_reason?:string}={};
  const result=await fetchVerifiedPublisherPageDate(valid,"geopolitics",{
   now,fetchImpl:fetchImpl as typeof fetch,diagnostics:diag,
  });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(result).toBe("2026-10-12T07:41:00.000Z");
  expect(diag).toEqual({code:"PRECISE_PUBLICATION_VERIFIED",date_reason:"PRECISE_PUBLICATION_ACCEPTED"});
 });
 it("fails closed at a strict 384KiB body ceiling, even when first-publication metadata is visible",async()=>{
  const html=published+"private article text ".repeat(22000)+"</body></html>";
  expect(Buffer.byteLength(html)).toBeGreaterThan(384*1024);
  const fetchImpl=vi.fn(async()=>new Response(html,{
   headers:{"content-type":"text/html","content-length":String(Buffer.byteLength(html))},
  }));
  const diagnostic:{code?:string}={};
  const result=await fetchVerifiedPublisherPageDate(valid,"geopolitics",{
   now,fetchImpl:fetchImpl as typeof fetch,diagnostics:diagnostic,
  });
  expect(result).toBeNull();
  expect(diagnostic).toEqual({code:"BODY_TOO_LARGE"});
  expect(fetchImpl).toHaveBeenCalledTimes(1);
 });
 it("never infers publication from an updated time in a larger document",()=>{
  const html='<html><head><meta name="govuk:public-updated-at" '+
   'content="2026-10-12T07:59:00+00:00"></head><body>'+
   "Unrelated words ".repeat(9500)+"</body></html>";
  expect(Buffer.byteLength(html)).toBeGreaterThan(128*1024);
  expect(verifiedPublisherPageDate(html,now)).toBeNull();
 });
 it("refuses a same-publisher article with conflicting original publication clocks",()=>{
  const html=published+'<meta property="article:published_time" '+
   'content="2026-10-12T05:00:00+00:00"></body></html>';
  expect(verifiedPublisherPageDate(html,now)).toBeNull();
 });
});
