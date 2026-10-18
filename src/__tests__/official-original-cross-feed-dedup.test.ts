import {describe, expect, it} from "vitest";
import {deriveStatelessSignals, type StatelessSourceCandidate} from "@/lib/stateless-intelligence-model";

const now=Date.parse("2026-10-18T12:00:00Z");
const original="https://www.minister.industry.gov.au/king/media/rare-earths-project-exports";
const candidate=(patch:Partial<StatelessSourceCandidate>={}):StatelessSourceCandidate=>({
  sourceId:"au_industry_minister", category:"rare_earth",
  title:"New rare earths project strengthens mineral supply chains",
  articleUrl:original, publishedAt:"2026-10-16T05:00:00Z", credit:null, ...patch,
});

describe("exact original identity across official feed lanes",()=>{
  it("delivers one Australian original shared by minister RSS and HTML index, preserving the selected legacy ID",()=>{
    const rss=candidate();
    const index=candidate({sourceId:"au_resources_minerals_index", publishedAt:"2026-10-16", datePrecision:"day"});
    const single=deriveStatelessSignals([rss],now);
    const combined=deriveStatelessSignals([rss,index,rss],now);
    expect(single).toHaveLength(1);
    expect(combined).toEqual(single);
    expect(combined[0]).toMatchObject({observed_release_count:1,severity:null,same_event_corrob_verified:false});
    expect(JSON.stringify(combined)).not.toContain(original);
    expect(JSON.stringify(combined)).not.toContain(rss.title);
  });
  it("keeps distinct original URLs even when their headlines and publisher are identical",()=>{
    const a=candidate();
    const b=candidate({sourceId:"au_resources_minerals_index",articleUrl:original+"-second"});
    const result=deriveStatelessSignals([a,b],now);
    expect(result).toHaveLength(2);
    expect(new Set(result.map(x=>x.id)).size).toBe(2);
  });
  it("retains a genuinely relevant original separately in macro and minerals",()=>{
    const title="Rare earths project supports resources and energy exports";
    const macro=candidate({sourceId:"au_resources_macro_index",category:"macro",title,
      publishedAt:"2026-10-16",datePrecision:"day"});
    const minerals=candidate({sourceId:"au_resources_minerals_index",title,
      publishedAt:"2026-10-16",datePrecision:"day"});
    const result=deriveStatelessSignals([macro,minerals,macro,minerals],now);
    expect(result).toHaveLength(2);
    expect(result.map(x=>x.category).sort()).toEqual(["macro","rare_earth"]);
  });
  it("does not allow a rejected future original to suppress a valid later occurrence",()=>{
    const result=deriveStatelessSignals([
      candidate({publishedAt:"2026-10-19T05:00:00Z"}),candidate(),
    ],now);
    expect(result).toHaveLength(1);
    expect(result[0].published_at).toBe("2026-10-16T05:00:00.000Z");
  });
});
