import {describe,it,expect,vi} from "vitest";
import {URL as NodeURL} from "node:url";
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
      hash:u.hash,hostname:u.hostname}).toEqual({
      protocol:"https:",port:"",username:"",password:"",hash:"",
      hostname:"example.org",
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
  it("never starves Macro or Critical Minerals in a skewed 209/308/18 real registry",()=>{
    const counts=[["GEOPOLITICS",209],["MACRO",308],["CRITICAL_MINERALS",18]] as const;
    const roots=counts.flatMap(([category,count])=>
      Array.from({length:count},(_,j)=>({source_id:category.toLowerCase()+"_"+j,
        category,root_url:"https://example.org/official"})));
    const all={roots};
    const seen=new Set<string>();
    const windows=Math.ceil(535/MAX_ROOTS_PER_WINDOW);
    for(let i=0;i<windows;i++){
      const selection=selectGovernedRootWindow(all,new Date(t.getTime()+i*90*60*1000));
      expect(selection.roots.length).toBeGreaterThanOrEqual(38);
      expect(selection.roots.length).toBeLessThanOrEqual(40);
      const perDomain=Object.fromEntries(counts.map(([category])=>
        [category,selection.roots.filter(r=>r.category===category).length]));
      expect(perDomain.GEOPOLITICS).toBeGreaterThan(0);
      expect(perDomain.MACRO).toBeGreaterThan(0);
      expect(perDomain.CRITICAL_MINERALS).toBeGreaterThan(0);
      for(const item of selection.roots){
        expect(seen.has(item.source_id)).toBe(false);
        seen.add(item.source_id);
      }
    }
    expect(seen.size).toBe(535);
  });
  it("reports transport-only status across all three domains without publisher content",async()=>{
    const fetchImpl=vi.fn(async()=>{
      return {status:200,body:{cancel:async()=>{}}};
    });
    const r=await probeGovernedRoots({catalog,now:t,fetchImpl});
    expect(r.checked_roots).toBe(39);
    expect(r.http_reachable).toBe(39);
    expect(fetchImpl).toHaveBeenCalledTimes(39);
    expect(Object.keys(r.per_domain).sort()).toEqual(
      ["GEOPOLITICS","MACRO","CRITICAL_MINERALS"].sort());
    expect(r.other_roots_not_checked_this_window).toBe(496);
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
  it("resolves one same-origin HTTPS redirect, never an external/HTTP redirect",async()=>{
    const catalog={roots:[
      row(0,"https://example.org/start"),
      row(1,"https://example.net/external"),
      row(2,"https://example.com/insecure"),
    ]};
    const fetchImpl=vi.fn(async(url:string)=>{
      if(url.endsWith("/start"))return {
        status:301,headers:{get:()=>"/canonical"},body:null};
      if(url.endsWith("/canonical"))return{status:200,headers:{get:()=>null},body:null};
      if(url.endsWith("/external"))return{
        status:302,headers:{get:()=>"https://evil.test/attack"},body:null};
      return {status:302,headers:{get:()=>"http://example.com/not-https"},body:null};
    });
    const x=await probeGovernedRoots({catalog,now:t,fetchImpl});
    expect(x.rows.map((r:any)=>r.status)).toEqual([
      "ROOT_HTTP_REACHABLE","ROOT_REDIRECT_UNVERIFIED","ROOT_REDIRECT_UNVERIFIED"]);
    expect(x.rows[0].same_origin_redirect_resolved).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(fetchImpl.mock.calls.every(([,opts]:any)=>opts.redirect==="manual")).toBe(true);
    expect(JSON.stringify(x)).not.toContain("evil.test");
  });
  it("fails on invalid duplicate source IDs rather than hiding skipped rows",()=>{
    const bad={roots:[row(0),row(0)]};
    expect(()=>selectGovernedRootWindow(bad,t)).toThrow("ROOT_HEALTH_SOURCE_ID_OR_CATEGORY_INVALID");
  });
});
