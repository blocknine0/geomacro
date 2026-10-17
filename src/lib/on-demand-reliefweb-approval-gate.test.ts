import {afterEach,describe,expect,it,vi} from "vitest";
import {discoverOnDemandForPrivateQualification,discoverOnDemandGlobal} from "./on-demand-global-discovery.server";
import {readFileSync} from "node:fs";

const now=new Date("2026-10-11T15:00:00Z");
const input={country_iso3:"CHN",categories:["geopolitics" as const]};
afterEach(()=>vi.unstubAllEnvs());

function provider() {
  const seen:string[]=[];
  const f=vi.fn(async(request:RequestInfo|URL,opts?:RequestInit)=>{
    const uri=new URL(String(request));
    seen.push(uri.href);
    expect(uri.protocol).toBe("https:");
    expect(opts?.method).toBe("GET");
    expect(opts?.redirect).toBe("manual");
    if(uri.hostname==="api.worldbank.org")
      return Response.json([{page:1,total:1},[{id:"CHN",name:"China"}]]);
    if(uri.hostname==="api.gdeltproject.org")
      return Response.json({articles:[]});
    if(uri.hostname==="api.reliefweb.int")
      return Response.json({data:[{fields:{date:{original:"2026-10-11T12:00:00Z"}}}]});
    if(uri.hostname==="news.un.org"||uri.hostname==="www.gov.uk")
      return new Response("<rss><channel></channel></rss>",{headers:{"content-type":"application/rss+xml"}});
    throw Error("UNEXPECTED_TEST_PROVIDER");
  }) as unknown as typeof fetch;
  return {f,seen};
}
describe("ReliefWeb third-party account approval is an access requirement",()=>{
  it.each(["","geomacro.live","test","invalid credential /path"])(
    "skips an unapproved or malformed appname %s without upstream API traffic",
    async value=>{
      vi.stubEnv("RELIEFWEB_APPROVED_APPNAME",value);
      const p=provider();
      const proof=await discoverOnDemandForPrivateQualification(input,{fetchImpl:p.f,now});
      expect(proof.discovery.network_attempts).toBe(3);
      expect(p.seen).toHaveLength(3);
      expect(p.seen.some(u=>new URL(u).hostname==="api.reliefweb.int")).toBe(false);
      expect(proof.discovery.source_probes.some(p=>p.family==="reliefweb_discovery")).toBe(false);
      expect(proof.discovery.payable).toBe(false);
      expect(proof.discovery.settlement_attempted).toBe(false);
    }
  );
  it("permits only operator-installed approved-looking identifier, with no auth bypass or source leak",async()=>{
    vi.stubEnv("RELIEFWEB_APPROVED_APPNAME","geomacro-risk-research-6b293f");
    const p=provider();
    const proof=await discoverOnDemandGlobal(input,{fetchImpl:p.f,now});
    expect(proof.network_attempts).toBe(4);
    const request=p.seen.find(u=>new URL(u).hostname==="api.reliefweb.int");
    expect(request).toBeTruthy();
    expect(new URL(request!).searchParams.get("appname"))
      .toBe("geomacro-risk-research-6b293f");
    expect(JSON.stringify(proof)).not.toContain("geomacro-risk-research-6b293f");
    expect(proof.source_probes.find(p=>p.family==="reliefweb_discovery")?.reachable)
      .toBe(true);
    expect(proof.payable).toBe(false);
    expect(proof.source_derived_commercial_rights_verified).toBe(false);
  });
  it("never retries unauthorized API with borrowed appnames, mirrors or unbounded calls",()=>{
    const source=readFileSync("src/lib/on-demand-global-discovery.server.ts","utf8");
    expect(source).toContain('process.env.RELIEFWEB_APPROVED_APPNAME');
    expect(source).toContain('value==="geomacro.live"');
    expect(source).toContain('if (category==="geopolitics" && approvedReliefAppname)');
    expect(source).not.toContain('appname:"geomacro.live"');
    expect(source).not.toContain("RELIEFWEB_FALLBACK_PROXY");
  });
});