import {describe,it,expect} from "vitest";
import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";

describe("automatic current-original private scorer handoff",()=>{
  it("passes publisher URL SHA, stale D1, source-rights and fake-news negative tests",()=>{
    const r=spawnSync("node",["--test",
      "scripts/lib/private-novel-pulse-match.test.mjs"],
      {encoding:"utf8",timeout:15_000,maxBuffer:400_000});
    expect(r.status,r.stdout+"\n"+r.stderr).toBe(0);
  });
  it("only scheduled main private scoring reads real D1 novel fingerprints",()=>{
    const scorer=readFileSync("scripts/lib/official-native-rss.mjs","utf8");
    const pulse=readFileSync(".github/workflows/three-domain-30m-original-publisher-pulse.yml","utf8");
    const job=readFileSync(".github/workflows/restricted-private-current-scoring.yml","utf8");
    expect(pulse).toContain("private-scoring-from-new-originals:");
    expect(pulse).toContain("bounded_automatic_private_stage: true");
    expect(job).toContain("scripts/ingest-news.js --private-scored-stage");
    expect(scorer).toContain('process.env.GEOMACRO_AUTOMATIC_D1_PULSE_STAGE==="true"');
    expect(scorer).toContain("if(automaticRequested&&!fromAutomaticPulse)");
    expect(scorer).toContain('throw Error("PRIVATE_PULSE_AUTO_CONTEXT_UNVERIFIED")');
    expect(job).toContain('GEOMACRO_AUTOMATIC_D1_PULSE_STAGE: ${{ inputs.bounded_automatic_private_stage == true }}');
    expect(scorer).toContain('process.env.GITHUB_REF==="refs/heads/main"');
    expect(scorer).toContain('pipeline:"official_source_pulse_30m"');
    expect(scorer).toContain("selectPrivateNovelPulseRefs(read.get(category),category,now.getTime())");
    expect(scorer).toContain("privateOriginalMatchesPulse(row,refs,now.getTime())");
    expect(scorer).toContain("if(refs.size===0)return []");
    for(const unsafe of ["payment_required_now:true","settleCoinbase","SUPABASE_DB_URL"])
      expect(scorer).not.toContain(unsafe);
  });
});
