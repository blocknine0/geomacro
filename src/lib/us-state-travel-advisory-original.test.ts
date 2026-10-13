import { describe, expect, it } from "vitest";
import {
  acceptedOriginalArticleLink, deriveStatelessSignals, parseFirstPartyFeed,
  type StatelessSourceSpec,
} from "./stateless-intelligence-model";

const source:StatelessSourceSpec={
  id:"us_state_advisories",category:"geopolitics",media:"rss",
  url:"https://travel.state.gov/_res/rss/TAsTWs.xml",
  allowedHosts:["travel.state.gov"],credit:null,
};
const original="https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories/qatar-travel-advisory.html";
const now=Date.parse("2026-10-13T18:00:00.000Z");
const xml=(title:string,link=original,when="Tue, 13 Oct 2026 15:00:00 GMT")=>
  '<rss version="2.0"><channel><item><title>'+title+'</title><link>'+link+
  '</link><pubDate>'+when+'</pubDate></item></channel></rss>';

describe("U.S. State Dept original advisory RSS geopolitics admission",()=>{
  it("accepts one first-party native-original-date travel advisory without risk score",()=>{
    const result=parseFirstPartyFeed(xml("Qatar - Level 3: Reconsider Travel"),source,now);
    expect(result.dated).toHaveLength(1);
    expect(parseFirstPartyFeed(xml("Qatar Travel Advisory"),source,now).dated).toHaveLength(1);
    const findings=deriveStatelessSignals(result.dated,now);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      status:"official_release_observed_unscored",
      same_event_corrob_verified:false,severity:null,
    });
  });
  it("rejects third-party hosts, first-party non-advisory pages and unrelated headlines",()=>{
    expect(acceptedOriginalArticleLink(
      "https://travel.state.gov.evil.invalid/content/travel/en/traveladvisories/traveladvisories/qatar-travel-advisory.html",source
    )).toBeNull();
    expect(acceptedOriginalArticleLink(
      "https://travel.state.gov/content/travel/en/news.html",source
    )).toBeNull();
    expect(parseFirstPartyFeed(xml("Unrelated country weather"),source,now).dated).toHaveLength(0);
    expect(parseFirstPartyFeed(xml("Qatar - Level 9: Fake advisory"),source,now).dated).toHaveLength(0);
  });
  it("never treats a future, missing or too-early publisher clock as admissible",()=>{
    expect(parseFirstPartyFeed(xml("Qatar - Level 3: Reconsider Travel",original,
      "Wed, 14 Oct 2026 15:00:00 GMT"),source,now).dated).toHaveLength(0);
    expect(parseFirstPartyFeed(xml("Qatar - Level 3: Reconsider Travel",original,
      ""),source,now).dated).toHaveLength(0);
    const originalCandidate=parseFirstPartyFeed(xml("Qatar - Level 3: Reconsider Travel"),source,now).dated;
    expect(deriveStatelessSignals(originalCandidate,Date.parse("2026-10-13T15:08:00.000Z"))).toHaveLength(0);
  });
});
