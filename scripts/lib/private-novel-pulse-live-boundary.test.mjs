import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {fetchOfficialNativeArticles} from "./official-native-rss.mjs";

const now=new Date("2026-10-13T12:00:00.000Z");
const stamp="2026-10-13T11:45:00.000Z";
const url="https://news.un.org/en/story/2026/10/1234567";
const sha=createHash("sha256").update(url).digest("hex");
const title="United Nations Security Council discusses a ceasefire";
const rss="<rss version=\"2.0\"><channel><item><title>"+title+
  "</title><link>"+url+"</link><pubDate>Tue, 13 Oct 2026 11:45:00 GMT"+
  "</pubDate></item></channel></rss>";
const original={
  schema:"geomacro.private-source-pulse-checkpoint.v1",
  domain:"geopolitics",checked_at:stamp,commercial_eligible:false,
  original_review_claims_verified:false,original_publisher_date_observed:true,
  new_private_article_fingerprint_count:1,newly_seen_private_article_refs:[sha],
  recent_private_article_fingerprints:[
    {domain:"geopolitics",article_sha256:sha,native_published_at:stamp}],
};
async function withScopedPulse(metadata,fn){
  const oldFetch=globalThis.fetch;
  const saved=Object.fromEntries([
    "GITHUB_EVENT_NAME","GITHUB_REPOSITORY","GITHUB_REF",
    "D1_DATABASE_ID","CLOUDFLARE_ACCOUNT_ID","CLOUDFLARE_API_TOKEN",
  ].map(k=>[k,process.env[k]]));
  process.argv.push("--private-scored-stage");
  process.env.GITHUB_EVENT_NAME="schedule";
  process.env.GITHUB_REPOSITORY="blocknine0/geomacro";
  process.env.GITHUB_REF="refs/heads/main";
  process.env.D1_DATABASE_ID="local";
  process.env.CLOUDFLARE_ACCOUNT_ID="local";
  process.env.CLOUDFLARE_API_TOKEN="local";
  let reads=0;
  globalThis.fetch=async()=>{
    reads++;
    return Response.json({success:true,result:[{success:true,results:[{
      scope:"geopolitics",last_attempt_at:stamp,metadata_json:JSON.stringify(metadata),
      cursor:"{}",updated_at:stamp,
    }]}]});
  };
  try{return await fn(()=>reads)}
  finally{
    globalThis.fetch=oldFetch;process.argv.pop();
    for(const [k,v] of Object.entries(saved)){
      if(v===undefined)delete process.env[k];else process.env[k]=v;
    }
  }
}
test("scheduled private scorer refetches only exact novel first-party original",async()=>{
  await withScopedPulse(original,async reads=>{
    let sourceGets=0;
    const fresh=await fetchOfficialNativeArticles("geopolitics",{
      now,fetchImpl:async()=>{sourceGets++;return new Response(rss,{
        status:200,headers:{"content-type":"application/rss+xml"}})},
    });
    assert.equal(reads(),1);
    assert.equal(sourceGets,1);
    assert.equal(fresh.length,1);
    assert.equal(fresh[0].url,url);
    assert.equal(fresh[0].commercialEligible,false);
  });
});
test("different legitimate publisher article cannot ride another D1 wakeup",async()=>{
  await withScopedPulse({...original,
    new_private_article_fingerprint_count:1,
    newly_seen_private_article_refs:[createHash("sha256").update(url+"-other").digest("hex")],
    recent_private_article_fingerprints:[{domain:"geopolitics",
      article_sha256:createHash("sha256").update(url+"-other").digest("hex"),
      native_published_at:stamp}]},async()=>{
    const candidates=await fetchOfficialNativeArticles("geopolitics",{
      now,fetchImpl:async()=>new Response(rss,{status:200,
        headers:{"content-type":"application/rss+xml"}}),
    });
    assert.deepEqual(candidates,[]);
  });
});
test("no novel D1 SHA spends zero publisher or classifier calls",async()=>{
  await withScopedPulse({...original,
    new_private_article_fingerprint_count:0,
    newly_seen_private_article_refs:[]},async reads=>{
    const noCall=await fetchOfficialNativeArticles("geopolitics",{
      now,fetchImpl:()=>{throw Error("PUBLISHER_SHOULD_NOT_BE_CALLED")},
    });
    assert.deepEqual(noCall,[]);assert.equal(reads(),1);
  });
});
