import { describe, expect, it } from "vitest";
import {
  australianResourcesIndexCandidates, verifyAustralianResourcesOriginalArticle,
} from "@/lib/stateless-au-resources-original.server";
import { deriveStatelessSignals, conservativeDayReleaseMs } from "@/lib/stateless-intelligence-model";

const clock = Date.parse("2026-10-13T10:00:00Z");
const HOST = "https://www.minister.industry.gov.au";
const mineralTitle = "Construction starts on Arafura Rare Earths Project";
const macroTitle = "Resources and energy exports remain steady";
const mineralUrl = HOST + "/king/media/construction-starts-arafura-rare-earths-project";
const macroUrl = HOST + "/king/media/resources-and-energy-exports-remain-steady";
const card = (title:string, date:string, url:string) =>
  '<div class="views-row"><div class="date">' + date + '</div>' +
  '<h3><a href="' + url + '">' + title + '</a></h3></div>';
const index = '<main>' + card(mineralTitle,"8 October 2026",mineralUrl) +
  card(macroTitle,"2 October 2026",macroUrl) + '</main>';
const page = (title:string,date:string) =>
  '<html><main><h1>' + title + '</h1><div class="published">' + date +
  '</div><p>National industrial supply chain reporting.</p></main></html>';

describe("Australian resources original HTML-index fallback", () => {
  it("binds official index title/date to category without copying publisher data", () => {
    const minerals = australianResourcesIndexCandidates(index,"rare_earth",clock);
    const macro = australianResourcesIndexCandidates(index,"macro",clock);
    expect(minerals).toHaveLength(1);
    expect(macro).toHaveLength(1);
    expect(minerals[0]).toMatchObject({ articleUrl:mineralUrl,
      publishedAt:"2026-10-08",sourceId:"au_resources_minerals_index",datePrecision:"day" });
    expect(macro[0]).toMatchObject({ articleUrl:macroUrl,
      publishedAt:"2026-10-02",sourceId:"au_resources_macro_index",datePrecision:"day" });
    expect(verifyAustralianResourcesOriginalArticle(
      page(mineralTitle,"8 October 2026"),minerals[0],clock)).toBe(true);
    expect(verifyAustralianResourcesOriginalArticle(
      page(macroTitle,"2 October 2026"),macro[0],clock)).toBe(true);
  });
  it("rejects mismatched originals, foreign URLs, and fake publication clocks", () => {
    const good = australianResourcesIndexCandidates(index,"rare_earth",clock)[0];
    expect(verifyAustralianResourcesOriginalArticle(page(mineralTitle,"9 October 2026"),good,clock))
      .toBe(false);
    expect(verifyAustralianResourcesOriginalArticle(
      page("Unrelated energy announcement","8 October 2026"),good,clock)).toBe(false);
    expect(verifyAustralianResourcesOriginalArticle(
      '<h1>' + mineralTitle + '</h1><script>8 October 2026</script >' +
      '<p>Date modified 10 October 2026</p>', good,clock)).toBe(false);
    const attack = card(mineralTitle,"8 October 2026",
      "https://www.minister.industry.gov.au.attacker.example/king/media/rare-earths-fake");
    expect(australianResourcesIndexCandidates('<main>'+attack+'</main>',
      "rare_earth",clock)).toEqual([]);
    const future = card(mineralTitle,"15 October 2026",mineralUrl);
    expect(australianResourcesIndexCandidates('<main>'+future+'</main>',
      "rare_earth",clock)).toEqual([]);
  });
  it("preserves original-day website embargo and explicitly unscored output", () => {
    const candidate=australianResourcesIndexCandidates(index,"rare_earth",clock)[0];
    expect(deriveStatelessSignals([candidate],Date.parse("2026-10-09T12:14:59Z")))
      .toEqual([]);
    expect(conservativeDayReleaseMs("2026-10-08"))
      .toBe(Date.parse("2026-10-09T12:15:00Z"));
    const result=deriveStatelessSignals([candidate],clock);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ category:"rare_earth",date_precision:"day",
      severity:null,same_event_corrob_verified:false,
      status:"official_release_observed_unscored" });
    expect(JSON.stringify(result)).not.toContain(mineralUrl);
    expect(JSON.stringify(result)).not.toContain(mineralTitle);
  });
  it("does not promote a release into a paid risk object or score", () => {
    const candidate=australianResourcesIndexCandidates(index,"macro",clock)[0];
    const result=deriveStatelessSignals([candidate],clock);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBeNull();
    expect(result[0].same_event_corrob_verified).toBe(false);
  });
});
