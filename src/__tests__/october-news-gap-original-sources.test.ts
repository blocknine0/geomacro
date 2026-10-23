import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {pibMinesIndexCandidates,pibOriginalIstMs} from "@/lib/stateless-pib-mines-original.server";
import {deriveStatelessSignals,selectOfficialTopic} from "@/lib/stateless-intelligence-model";

const NOW = Date.parse("2026-10-12T20:00:00.000Z");
describe("October 11–13 original-publisher news gap recovery",()=>{
 it("finds 12 Oct Indian Mines release from bounded genuine PIB ministry section, not unrelated listings",()=>{
   const html='<h3>Ministry of Mines</h3><li><a href="/PressReleseDetail.aspx?PRID=2322448">' +
     'Union Minister Launches Commercialisation Catalogue of Technologies</a> Posted on: 12 Oct 2026</li>' +
     '<h3>Ministry of Education</h3><li><a href="/PressReleseDetail.aspx?PRID=9876543">Mining summer workshop</a> Posted on: 12 Oct 2026</li>';
   expect(pibMinesIndexCandidates(html,NOW)).toEqual([{id:"2322448",title:"Union Minister Launches Commercialisation Catalogue of Technologies"}]);
   expect(pibMinesIndexCandidates(html,Date.parse("2026-10-11T20:00:00Z"))).toEqual([]);
 });
 it("interprets PIB 12 Oct 2026 7:13PM as IST, never fetch or update time",()=>{
   expect(pibOriginalIstMs("Posted On: 12 OCT 2026 7:13PM by PIB Delhi"))
     .toBe(Date.parse("2026-10-12T13:43:00.000Z"));
   expect(pibOriginalIstMs("Updated On: 12 OCT 2026 7:13PM by PIB Delhi")).toBeNull();
   expect(pibOriginalIstMs("Posted On: 32 OCT 2026 7:13PM by PIB Delhi")).toBeNull();
   expect(pibOriginalIstMs("Posted On: 12 OCT 2026 0:13PM by PIB Delhi")).toBeNull();
 });
 it("admits 12 Oct India original at publication, but never falsely labels a risk score or recirculated article",()=>{
   const item={title:"India mineral research: Union Minister Launches Commercialisation Catalogue of Technologies",
     articleUrl:"https://www.pib.gov.in/PressReleasePage.aspx?PRID=2322448",
     publishedAt:"2026-10-12T13:43:00.000Z",
     sourceId:"in_pib_mines",category:"rare_earth" as const,credit:null};
   expect(deriveStatelessSignals([item],Date.parse("2026-10-12T13:42:59.999Z"))).toHaveLength(0);
   const data=deriveStatelessSignals([item],Date.parse("2026-10-12T13:43:00.000Z"));
   expect(data).toHaveLength(1);
   expect(data[0].published_at).toBe("2026-10-12T13:43:00.000Z");
   expect(data[0].severity).toBeNull();
   expect(data[0].status).toBe("official_release_observed_unscored");
   expect(JSON.stringify(data)).not.toContain("pib.gov.in");
   expect(JSON.stringify(data)).not.toContain("Union Minister Launches Commercialisation");
 });
 it("identifies UK Iran public-security news and UK-India economic trade releases without news invention",()=>{
   expect(selectOfficialTopic("Joint Statement on Iran, 12 October","geopolitics")?.name).toBe("foreign policy");
   expect(selectOfficialTopic("Home Secretary Statement on National Security","geopolitics")?.name).toBe("foreign policy");
   expect(selectOfficialTopic("India trade mission unlocks hundreds of UK jobs and new deals","macro")?.name).toBe("trade and economic relations");
   expect(selectOfficialTopic("Joint statement from India UK JETCO on trade deal","macro")?.name).toBe("trade and economic relations");
   expect(selectOfficialTopic("Generic minister congratulates school","macro")).toBeNull();
 });
 it("production SSR reads the public journal directly even without a working server-function transport",()=>{
   const route=readFileSync("src/routes/intelligence.tsx","utf8");
   const txt=route.slice(route.indexOf('loader: async () =>'),route.indexOf("  head: () =>"));
   expect(txt).toContain("fetchDirectDerivedNews()");
   expect(txt).not.toContain("getWebsiteDerivedNews()");
   expect(txt).toContain('journal: history.status === "fulfilled"');
 });
});
