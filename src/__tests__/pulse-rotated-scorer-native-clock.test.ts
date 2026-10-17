import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

describe("D1-verified rotated original issuers reach canonical private classifier",()=>{
  it("executes real publisher SHA+native-time regression tests, not just source string checks",()=>{
    const result=spawnSync("node",[
      "--test","scripts/lib/pulse-rotated-original-scorer.test.mjs",
    ],{encoding:"utf8",timeout:30_000,maxBuffer:900_000});
    expect(result.status,result.stdout+"\n"+result.stderr).toBe(0);
  });
  it("reuses validated D1 source pulse and never bypasses signing, rights or payment",()=>{
    const scorer=readFileSync("scripts/lib/official-native-rss.mjs","utf8");
    const bridge=readFileSync("scripts/lib/pulse-rotated-original-scorer.mjs","utf8");
    const test=readFileSync("scripts/lib/private-novel-pulse-match.mjs","utf8");
    expect(scorer).toContain("selectPrivateNovelPulseRefs(snapshot,category,now.getTime())");
    expect(scorer).toContain("privateOriginalMatchesPulse(");
    expect(scorer).toContain("expectedClocks");
    expect(scorer).toContain("fetchPulseRotatedPrivateOriginals");
    expect(scorer).toContain("if(refs.size===0)return []");
    expect(scorer).toContain('pipeline:"official_source_pulse_30m"');
    expect(bridge).toContain("selectedPulseRotatedScorerSources");
    expect(bridge).toContain("officialItemNativePublicationMs");
    expect(bridge).toContain("rightsVerified:false,commercialEligible:false");
    expect(bridge).toContain('source.id==="australia_industry_minister_original_rss_review"');
    expect(test).toContain("expectedClocks.get(identity)");
    for(const forbidden of [
      "settleCoinbase","signRiskObject(", "SUPABASE_DB_URL",
      "sourceIdentityPublic:true","commercialEligible:true", "payment_required_now:true",
    ])expect(bridge).not.toContain(forbidden);
  });
});
