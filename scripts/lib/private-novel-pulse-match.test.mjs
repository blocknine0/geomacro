import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {
  validatePrivatePulseRefs,privateOriginalMatchesPulse,selectPrivateNovelPulseRefs,
} from "./private-novel-pulse-match.mjs";

const now=Date.parse("2026-10-13T12:00:00.000Z");
const url="https://www.federalreserve.gov/newsevents/pressreleases/monetary20261013a.htm";
const hash=createHash("sha256").update(url).digest("hex");
const time="2026-10-13T11:45:00.000Z";
const row={
  last_attempt_at:time,
  payload:{
    schema:"geomacro.private-source-pulse-checkpoint.v1",domain:"macro",
    checked_at:time,commercial_eligible:false,
    original_review_claims_verified:false,
    original_publisher_date_observed:true,
    new_private_article_fingerprint_count:1,
    newly_seen_private_article_refs:[hash],
    recent_private_article_fingerprints:[{
      domain:"macro",article_sha256:hash,native_published_at:time,
    }],
  },
};
const candidate={
  url,sourceDomain:"www.federalreserve.gov",
  discoveryProvider:"official_native_rss",nativePublishedAtVerified:true,
  nativeTimeEvidence:"publisher_rss_item_pubDate",
  privateOnly:true,rightsVerified:false,commercialEligible:false,
  publishedAt:time,
};
test("uses only a current original SHA from the private D1 checkpoint",()=>{
  const refs=selectPrivateNovelPulseRefs(row,"macro",now);
  assert.equal(refs.size,1);
  assert.equal(privateOriginalMatchesPulse(candidate,refs,now),true);
  assert.equal(privateOriginalMatchesPulse({...candidate,
    url:url.replace("20261013a","20261013b")},refs,now),false);
});
test("never scores an unproven, off-host, stale or rights-promoted article",()=>{
  const refs=new Set([hash]);
  for(const patch of [
    {nativePublishedAtVerified:false},
    {commercialEligible:true},{rightsVerified:true},
    {discoveryProvider:"gdelt"},{sourceDomain:"attacker.example"},
    {publishedAt:"2026-10-10T00:00:00.000Z"},
    {publishedAt:"2026-10-13T12:01:00.000Z"},
    {url:"http://"+url.slice(8)},
  ])assert.equal(privateOriginalMatchesPulse({...candidate,...patch},refs,now),false);
});
test("missing, malformed or stale D1 original proof denies private scoring",()=>{
  for(const change of [
    {last_attempt_at:"2026-10-13T11:40:00.000Z"},
    {payload:{...row.payload,checked_at:"2026-10-13T10:00:00.000Z"}},
    {payload:{...row.payload,commercial_eligible:true}},
    {payload:{...row.payload,new_private_article_fingerprint_count:2}},
    {payload:{...row.payload,recent_private_article_fingerprints:[]}},
    {payload:{...row.payload,newly_seen_private_article_refs:[hash,hash]}},
    {payload:{...row.payload,original_publisher_date_observed:false}},
  ])assert.throws(()=>selectPrivateNovelPulseRefs({...row,...change},"macro",now));
  assert.throws(()=>selectPrivateNovelPulseRefs(row,"geopolitics",now));
  assert.throws(()=>validatePrivatePulseRefs("macro",["spoofed"]));
});
test("zero newly seen originals remains genuinely empty and unchargeable",()=>{
  const empty={...row,payload:{...row.payload,
    new_private_article_fingerprint_count:0,newly_seen_private_article_refs:[]}};
  assert.equal(selectPrivateNovelPulseRefs(empty,"macro",now).size,0);
  assert.equal(privateOriginalMatchesPulse(candidate,new Set(),now),false);
});

await import("./private-novel-pulse-live-boundary.test.mjs");
