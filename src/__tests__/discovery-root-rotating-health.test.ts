import {describe,it,expect,vi} from "vitest";
import {URL as NodeURL} from "node:url";
import {isIP} from "node:net";
import {
  MAX_ROOTS_PER_WINDOW,selectGovernedRootWindow,probeGovernedRoots,approvedRoot,
} from "../../scripts/ops/probe-source-discovery-roots.mjs";

const row=(i:number,url="https://example.org/official")=>({
  source_id:"source_"+i,category:i%3===0?"GEOPOLITICS":
    i%3===1?"MACRO":"CRITICAL_MINERALS",root_url:url,
});
const catalog={roots:Array.from({length:535},(_,i)=>row(i))};
const t=new Date(90*60*1000*14*200);

describe("#1827 bounded governed source root health",()=>{
  it("adopts native valid HTTPS URL and rejects private network URLs",()=>{
    const u=new NodeURL("https://example.org/official");
    expect({protocol:u.protocol,port:u.port,username:u.username,password:u.password,
      hash:u.hash,hostname:u.hostname,isIp:isIP(u.hostname)}).toEqual({
      protocol:"https:",port:"",username:"",password:"",hash:"",
      hostname:"example.org",isIp:0,
    });
    expect(approvedRoot("https://example.org/official")?.hostname).toBe("example.org");
    expect(approvedRoot("https://192.168.1.1/admin")).toBeNull();
  });
  it("deterministically covers 535 roots in 14 distinct 90-minute slots",()=>{
    const n=Math.ceil(535/MAX_ROOTS_PER_WINDOW);
    expect(n).toBe(14);
    const ids=new Set();
    for(let i=0;i<n;i++){
      const slot=selectGovernedRootWindow(catalog,new Date(t.getTime()+i*90*60*1000));
      expect(slot.roots.length).toBeLessThanOrEqual(40);
      for(const item of slot.roots)ids.add(item.source_id);
    }
    expect(ids.size).toBe(535);
  });
  it("reports transport-only status across all three domains without publisher content",async()=>{
    const fetchImpl=vi.fn(async()=>{
      return {status:200,body:{cancel:async()=>{}}};
    });
    const r=await probeGovernedRoots({catalog,now:t,fetchImpl});
    expect(r.checked_roots).toBe(40);
    expect(r.http_reachable).toBe(40);
    expect(fetchImpl).toHaveBeenCalledTimes(40);
    expect(Object.keys(r.per_domain).sort()).toEqual(
      ["GEOPOLITICS","MACRO","CRITICAL_MINERALS"].sort());
    expect(r.other_roots_not_checked_this_window).toBe(495);
    expect(r.all_sources_working_claim).toBe(false);
    expect(r.original_articles_ingested).toBe(0);
    expect(r.registered_roots_auto_activated_as_news_feeds).toBe(0);
    expect(r.b2_requests+r.supabase_writes+r.d1_writes).toBe(0);
    expect(JSON.stringify(r)).not.toContain("example.org");
  });
  it("does not bypass a 403/429 or follow redirects, and blocks unsafe root URLs",async()=>{
    const roots=[row(0,"https://192.168.0.10/admin"),
      row(1,"https://example.org/forbidden"),row(2,"https://example.net/redirect"),
      row(3,"https://example.com/readonly")];
    const fetchImpl=vi.fn(async(url:string,opts:any)=>{
      if(url.includes("forbidden"))return {status:403,body:null};
      if(url.includes("redirect"))return {status:302,body:null};
      if(opts.method==="HEAD")return {status:405,body:null};
      return {status:206,body:null};
    });
    const proof=await probeGovernedRoots({catalog:{roots},now:t,fetchImpl});
    expect(proof.rows.map((r:any)=>r.status)).toEqual([
      "ROOT_INVALID_OR_UNSAFE_URL","ROOT_ACCESS_DENIED",
      "ROOT_REDIRECT_UNVERIFIED","ROOT_HTTP_REACHABLE"]);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(fetchImpl.mock.calls.every(([,o]:any)=>o.redirect==="manual")).toBe(true);
  });
  it("fails on invalid duplicate source IDs rather than hiding skipped rows",()=>{
    const bad={roots:[row(0),row(0)]};
    expect(()=>selectGovernedRootWindow(bad,t)).toThrow("ROOT_HEALTH_SOURCE_ID_OR_CATEGORY_INVALID");
  });
});
