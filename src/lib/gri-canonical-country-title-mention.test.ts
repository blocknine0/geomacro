import {describe,expect,it} from "vitest";
import {COUNTRIES_195} from "./canonical-country-registry-195";
import {exactCanonicalCountryMentionFromOriginalTitle as titleCountry}
  from "./gri-canonical-country-title-mention";
import {deriveStatelessSignals} from "./stateless-intelligence-model";

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
