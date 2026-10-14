import {afterEach,describe,expect,it,vi} from "vitest";
import {publicSources} from "../../global-intelligence/adapters/public-sources.mjs";

const expectedUrl="https://sdmx.oecd.org/public/rest/dataflow/OECD.SDD.NAD/DSD_NAAG@DF_NAAG_I/latest?references=none";
function fixtureResponse(xml:string,status=200):Response{
  return new Response(xml,{status,headers:{"content-type":"application/vnd.sdmx.structure+xml;version=2.1"}});
}

describe("OECD bounded official SDMX original dataflow health",()=>{
  afterEach(()=>vi.unstubAllGlobals());
  it.each([
    '<mes:Structure xmlns:mes="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/message" xmlns:str="http://www.sdmx.org/resources/sdmxml/schemas/v2_1/structure"><mes:Structures><str:Dataflows><str:Dataflow id="DSD_NAAG@DF_NAAG_I" agencyID="OECD.SDD.NAD" version="1.0"/></str:Dataflows></mes:Structures></mes:Structure>',
    '<?xml version="1.0"?><Structure><Dataflows><Dataflow id="DSD_NAAG@DF_NAAG_I" agencyID="OECD.SDD.NAD" /></Dataflows></Structure>',
  ])("accepts a genuine-looking SDMX dataflow element with a real word boundary",async xml=>{
    const mock=vi.fn(async()=>fixtureResponse(xml));
    vi.stubGlobal("fetch",mock);
    expect(await publicSources.oecd()).toEqual({source_id:"oecd_sdmx",observations:1});
    expect(mock).toHaveBeenCalledTimes(1);
    const [url,options]=mock.mock.calls[0] as unknown as [string,RequestInit];
    expect(url).toBe(expectedUrl);
    expect(options.headers).toHaveProperty("accept");
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });
  it.each([
    '<html><body>service unavailable</body></html>',
    '<Structure><Dataflows/></Structure>',
    '<Structure><Dataflows><DataflowMetadata/></Dataflows></Structure>',
    '<Structure><Dataflows><Dataflows id="fake"/></Dataflows></Structure>',
  ])("fails closed on a response without a Dataflow element",async xml=>{
    vi.stubGlobal("fetch",vi.fn(async()=>fixtureResponse(xml)));
    await expect(publicSources.oecd()).rejects.toThrow("OECD_SDMX_DATAFLOW_UNVERIFIED");
  });
  it.each([403,429,503])("does not reinterpret upstream HTTP %i as a valid source",async status=>{
    vi.stubGlobal("fetch",vi.fn(async()=>fixtureResponse("not authorized",status)));
    await expect(publicSources.oecd()).rejects.toThrow("PUBLIC_SOURCE_HTTP_"+status);
  });
  it("rejects oversized OECD SDMX responses without exposing the bytes",async()=>{
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(
      "<str:Dataflow id='x'/>",
      {headers:{"content-length":String(2*1024*1024+1)}})));
    await expect(publicSources.oecd()).rejects.toThrow("PUBLIC_SOURCE_OVERSIZE");
  });
});
