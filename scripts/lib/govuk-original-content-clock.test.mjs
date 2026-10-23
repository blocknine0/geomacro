import test from "node:test";
import assert from "node:assert/strict";
import {pinnedGovUkContentApiUrl,verifiedGovUkContentFirstPublishedAt}
 from "./govuk-original-content-clock.mjs";
const articleUrl="https://www.gov.uk/government/news/uk-government-publishes-new-critical-minerals-strategy";
const title="UK government publishes new critical minerals strategy";
const html='<html><head><meta name="govuk:last-updated-at" content="2026-10-23T22:59:00Z"></head>'+
 '<body><h1 class="govuk-heading-l">'+title+'</h1></body></html>';
const time="2026-10-23T18:20:00Z";
const now=new Date("2026-10-23T18:48:00Z");
const data={
 base_path:new URL(articleUrl).pathname,title,document_type:"news_story",
 first_published_at:time,public_updated_at:"2026-10-23T22:59:00Z"
};
const call=(patch={},extras={})=>verifiedGovUkContentFirstPublishedAt({
 articleUrl,html,contentJson:JSON.stringify({...data,...patch}),
 articleTitle:title,now,...extras
});
test("one real issuer native timestamp rescue for all three eligible domain callers, never update clock",()=>{
 assert.equal(pinnedGovUkContentApiUrl(articleUrl),
  "https://www.gov.uk/api/content"+data.base_path);
 assert.equal(call(),"2026-10-23T18:20:00.000Z");
 assert.equal(call({public_updated_at:"2026-10-24T12:00:00Z"}),"2026-10-23T18:20:00.000Z");
});
test("rejects unapproved original URL, path, query, nonpublisher and unsafe scheme",()=>{
 for(const articleUrl of ["https://evil.example/government/news/"+title,
  "http://www.gov.uk"+data.base_path,
  "https://www.gov.uk"+data.base_path+"?track=1",
  "https://www.gov.uk/government/publications/a/",
  "https://www.gov.uk/api/content"+data.base_path])
  assert.equal(pinnedGovUkContentApiUrl(articleUrl),null);
});
test("no claim without exact first-party base_path, body heading and plausible issuer title",()=>{
 for(const patch of [
  {base_path:"/government/news/other-publisher-story"},
  {title:"Unrelated announced market securities"},
  {document_type:"landing_page"},
  {first_published_at:null},
  {first_published_at:"2026-10-23"},
  {first_published_at:"2026-10-23T18:20:00"},
  {first_published_at:"2026-10-23T20:20:00Z"},
  {first_published_at:"2026-10-20T18:20:00Z"},
  {first_published_at:"2026-02-30T18:20:00Z"},
  {publication_state:"withdrawn"},
 ])assert.equal(call(patch),null);
 assert.equal(call({}, {html:"<html><h1>Different headline entirely</h1></html>"}),null);
 assert.equal(call({}, {articleTitle:"Sanctions affecting another publisher"}),null);
 assert.equal(verifiedGovUkContentFirstPublishedAt({
  articleUrl,html,contentJson:"not a JSON",now
 }),null);
});
