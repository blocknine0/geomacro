import {describe,expect,it} from "vitest";
import {COUNTRIES_195} from "./canonical-country-registry-195";
import {exactCanonicalCountryMentionFromOriginalTitle as titleCountry}
  from "./gri-canonical-country-title-mention";
import {deriveStatelessSignals} from "./stateless-intelligence-model";
import {readFileSync} from "node:fs";
import {buildMaterialGriNewsReviewQueue}
  from "../../scripts/lib/material-gri-news-review.mjs";
import {buildMaterialGriCountryEvidenceWorklist}
  from "../../scripts/lib/material-gri-country-evidence-worklist.mjs";

const NOW=Date.parse("2026-10-18T18:00:00Z");
function a(category:"geopolitics"|"macro"|"rare_earth",title:string) {
  return deriveStatelessSignals([{
    title,category,sourceId:"official_issuer_original",
    articleUrl:"https://example.org/original/2026/10/18/one",
    publishedAt:"2026-10-18T16:50:00Z",credit:null,
  }],NOW,{websiteDelay:true});
}
describe("195-country first-party original-title GRI review coverage",()=>{
  it("reads the actual immutable 195-country registry, not a fixed short publisher list",()=>{
    expect(COUNTRIES_195.length).toBe(195);
    for(const [literal,country] of [
      ["Kazakhstan","Kazakhstan"],["Mongolia","Mongolia"],
      ["Kyrgyzstan","Kyrgyzstan"],["Bangladesh","Bangladesh"],
      ["Nepal","Nepal"],["Uzbekistan","Uzbekistan"],
      ["Bhutan","Bhutan"],["Argentina","Argentina"],
      ["São Tomé and Príncipe","São Tomé and Príncipe"],
      ["State of Palestine","State of Palestine"],
      ["Holy See","Holy See"],
    ])expect(titleCountry("Official trade policy update in "+literal)).toBe(country);
  });
  it("never assigns a sole ISO3 when multiple sovereign states or ambiguous names appear",()=>{
    for(const title of [
      "Copper in Kazakhstan and Uzbekistan",
      "Mining approvals in Nepal and Bangladesh",
      "Security update in Kazakhstan and Georgia",
      "Lithium prices in American Samoa",
      "News about Jordan and Nepal",
      "Government policy in Chad",
      "The finance report of Atlantis",
      "<script>Bangladesh</script>",
      "The Netherlands\nNew Zealand agreement",
      "No mention of any country at all",
    ])expect(titleCountry(title)).toBeNull();
    expect(titleCountry("Mining review: Papua New Guinea")).toBe("Papua New Guinea");
  });
  it("passes exactly observed official-title ISO3 geography to Geomacro's score-free event selection",()=>{
    const signals=a("rare_earth","Kazakhstan launches lithium mineral-processing policy");
    expect(signals).toHaveLength(1);
    expect(signals[0].geography).toBe("Kazakhstan");
    expect(signals[0].title).toContain("Geomacro finds");
    expect(signals[0].same_event_corrob_verified).toBe(false);
    expect(signals[0].severity).toBeNull();
    expect(signals[0].status).toBe("official_release_observed_unscored");
    expect(JSON.stringify(signals)).not.toContain("example.org");
    expect(JSON.stringify(signals)).not.toContain("Kazakhstan launches lithium");
  });
  it("retains a real 15-minute freshness embargo and excludes incorrect original publication",()=>{
    const fresh=deriveStatelessSignals([{
      category:"geopolitics" as const,
      sourceId:"official_issuer_original",
      title:"Kazakhstan policy update on sanctions",
      articleUrl:"https://example.org/original/2026/10/18/one",
      publishedAt:"2026-10-18T17:55:00Z",credit:null,
    }],NOW,{websiteDelay:true});
    expect(fresh).toEqual([]);
    const older=deriveStatelessSignals([{
      category:"macro" as const,
      sourceId:"official_issuer_original",
      title:"Mongolia announces inflation data",
      articleUrl:"https://example.org/original/2026/10/18/one",
      publishedAt:"2026-10-18T16:50:00Z",credit:null,
    }],NOW,{websiteDelay:true});
    expect(older[0].geography).toBe("Mongolia");
  });
});

describe("first-party literal countries remain country-routable in 90m private GRI review",()=>{
  it("maps signed-evidence CHECK targets in all 3 domains without authorizing GRI scoring",()=>{
    const inputs=[
      ["geopolitics","Uzbekistan sanctions trade restriction","UZB"],
      ["macro","Mongolia monetary policy rate cut","MNG"],
      ["rare_earth","Kazakhstan lithium export ban","KAZ"],
    ] as const;
    const reports=inputs.map(([category,title])=>{
      const signals=a(category,title);
      expect(signals).toHaveLength(1);
      return {category,checked_at:new Date(NOW).toISOString(),
        healthy_feed_count:1,signals};
    });
    const queue=buildMaterialGriNewsReviewQueue(reports,NOW);
    const countryRegistry=readFileSync("src/lib/canonical-country-registry-195.ts","utf8");
    const work=buildMaterialGriCountryEvidenceWorklist(queue,countryRegistry,NOW);
    expect(work.categories.map((r:any)=>r.review_targets[0].country_iso3))
      .toEqual(inputs.map((x)=>x[2]));
    expect(work.current_native_original_90m_review_targets).toBe(3);
    expect(work.current_native_original_90m_country_mapped_targets).toBe(3);
    expect(work.categories.every((c:any)=>
      c.review_targets[0].can_promote_from_worklist===false &&
      c.review_targets[0].gri_score===null &&
      c.review_targets[0].candidate_within_90m_new_gri_window===true
    )).toBe(true);
    expect(work.real_signed_gri_scoring_permission_inferred).toBe(false);
    expect(work.public_gri_or_indices_written).toBe(false);
    expect(JSON.stringify(work)).not.toContain("example.org");
  });
});
