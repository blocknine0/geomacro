import {describe,expect,it,vi} from "vitest";
import {discoverBlsNewsroomOriginals,verifyBlsNewsroomOriginal}
  from "../lib/stateless-bls-newsroom-original.server";
import {readStatelessWebsiteIntelligence} from "../lib/stateless-public-intelligence.server";

const clock=Date.parse("2026-10-17T17:00:00.000Z");
const newsroom=(body:string)=>`<html><h1>BLS Newsroom</h1>
<section>Latest News Releases from the National Office
${body} Latest Publications</section></html>`;
const snippet=(family:string,title:string,date:string)=>
  `<li><a href="/news.release/${family}.toc.htm">${title}</a> ${date}</li>`;
const page=(date="Wednesday, October 14, 2026",title="Consumer Price Index Summary")=>
  `<!doctype html><html><h1>${title}</h1>
  <p>Transmission of material in this release is embargoed until
  8:30 a.m. (ET) ${date} USDL-26-1234</p>
  <h2>CONSUMER PRICE INDEX - SEPTEMBER 2026</h2></html>`;

describe("BLS same-publisher newsroom release-day recovery",()=>{
  it("recognizes only fixed first-party original release families and live indexed days",()=>{
    const html=newsroom(snippet("cpi","Consumer Price Index","10/14/2026")+
      snippet("empsit","Employment Situation","10/02/2026")+
      snippet("ximpim","U.S. Import and Export Price Indexes","10/16/2026"));
    const rows=discoverBlsNewsroomOriginals(html,clock);
    expect(rows).toHaveLength(3);
    expect(rows.map(x=>x.family)).toEqual(["cpi","empsit","ximpim"]);
    expect(rows[0].articleUrl).toBe("https://www.bls.gov/news.release/cpi.nr0.htm");
    expect(rows[0].date).toBe("2026-10-14");
    expect(verifyBlsNewsroomOriginal(page(),rows[0],clock)).toBe("2026-10-14");
    expect(verifyBlsNewsroomOriginal(page("Wednesday, October 15, 2026"),rows[0],clock)).toBeNull();
    expect(verifyBlsNewsroomOriginal(page("Wednesday, October 14, 2026","The latest rugby results"),rows[0],clock)).toBeNull();
  });
  it("cannot invent original news from forthcoming dates, an archive link, or another domain",()=>{
    const unsafe=newsroom(snippet("cpi","Consumer Price Index","10/18/2026")+
      snippet("cpi","Consumer Price Index","02/30/2026")+
      `<li><a href="https://www.bls.gov.evil.example/news.release/empsit.toc.htm">Employment Situation</a>10/16/2026</li>`+
      `<a href="/news.release/archives/cpi_10142026.htm">Consumer Price Index</a> 10/14/2026`);
    expect(discoverBlsNewsroomOriginals(unsafe,clock)).toEqual([]);
    const valid=discoverBlsNewsroomOriginals(newsroom(
      snippet("cpi","Consumer Price Index","10/14/2026")),clock)[0];
    expect(verifyBlsNewsroomOriginal(page().replace("Transmission of material in this release is embargoed until","Last Modified Date:"),valid,clock)).toBeNull();
    expect(verifyBlsNewsroomOriginal(page(),{...valid,articleUrl:"https://thirdparty.test/cpi.nr0.htm"},clock)).toBeNull();
    expect(verifyBlsNewsroomOriginal(page("Wednesday, February 30, 2026"),valid,clock)).toBeNull();
  });
  it("produces only independently page-verified unscored day-precision derived Macro news",async()=>{
    const fetchMock=vi.fn(async(input:RequestInfo|URL)=>{
      const url=input instanceof Request?input.url:String(input);
      if(url==="https://www.bls.gov/newsroom/")
        return new Response(newsroom(snippet("cpi","Consumer Price Index","10/14/2026")),{
          headers:{"Content-Type":"text/html"},
        });
      if(url==="https://www.bls.gov/news.release/cpi.nr0.htm")
        return new Response(page(),{headers:{"Content-Type":"text/html"}});
      return new Response(null,{status:403});
    });
    vi.stubGlobal("fetch",fetchMock);
    try{
      const r=await readStatelessWebsiteIntelligence("macro",clock);
      expect(r.feed_count).toBe(20);
      expect(r.healthy_feed_count).toBe(1);
      expect(fetchMock.mock.calls.some(x=>String(x[0]).includes("/newsroom/"))).toBe(true);
      expect(r.signals.length).toBeGreaterThan(0);
      expect(r.signals.every(x=>x.category==="macro" &&
        x.status==="official_release_observed_unscored" &&
        x.date_precision==="day" && x.same_event_corrob_verified===false &&
        x.severity===null)).toBe(true);
    }finally{vi.unstubAllGlobals();}
  });
});
