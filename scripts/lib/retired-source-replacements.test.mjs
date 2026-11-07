import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {retiredSourceReplacements,applyRetiredSourceReplacements} from "./retired-source-replacements.mjs";
import {isRetiredPrivateOsintSource} from "./private-osint-retired-sources.mjs";
const document=()=>JSON.parse(readFileSync(new URL("../../config/retired-source-replacements.v1.json",import.meta.url),"utf8"));

test("removed IDs and exact feed URL aliases cannot re-enter any replacement registry",()=>{
 const doc=document();
 assert.equal(doc.retired.length,127);
 for(const old of doc.retired){
  assert.ok(isRetiredPrivateOsintSource(old));
  if(old.url)assert.ok(isRetiredPrivateOsintSource({id:"alias",url:old.url}));
 }
 const result=applyRetiredSourceReplacements(doc.retired);
 assert.equal(result.length,7);
 assert.equal(doc.unadmitted_candidates.length,5);
 assert.ok(doc.unadmitted_candidates.every(x=>x.github_runner_http_status===406&&x.same_article_url_hashes.length>0));
 assert.ok(result.every(x=>!isRetiredPrivateOsintSource(x)));
 assert.equal(new Set(result.map(x=>x.url)).size,result.length);
 assert.ok(result.every(x=>x.publisher_native_dates_required&&
  x.rights_verified===false&&x.commercial_eligible===false&&
  x.full_duplicate_news_coverage_verified===false));
 assert.equal(result.filter(x=>x.sampled_identical_article_urls>0).length,0);
});

test("same-publisher replacement cannot claim unrelated publisher, missing native items, or complete exact duplication",()=>{
 for(const mutate of [
  r=>r.url="https://unrelated.example.org/feed/",
  r=>r.native_72h_items_at_probe=0,
  r=>r.full_duplicate_news_coverage_verified=true,
  r=>r.same_article_url_hashes=["forged"],
 ]){
  const doc=document();mutate(doc.replacements[0]);
  assert.throws(()=>retiredSourceReplacements(doc),/SOURCE_REPLACEMENT_UNVERIFIED/);
 }
});

test("an already registered replacement URL is fetched once while category and retirement provenance merge",()=>{
 const replacement=retiredSourceReplacements()[0];
 const result=applyRetiredSourceReplacements([{...replacement,id:"existing_canonical",categories:["macro"]}]);
 const shared=result.filter(x=>x.url===replacement.url);
 assert.equal(shared.length,1);
 assert.equal(shared[0].id,"existing_canonical");
 assert.ok(shared[0].categories.includes("macro"));
 assert.ok(shared[0].replaces_retired_source_ids.includes(document().replacements[0].retired_source_id));
});
