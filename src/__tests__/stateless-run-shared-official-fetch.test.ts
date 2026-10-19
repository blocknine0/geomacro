import {describe,it,expect,vi} from "vitest";
import {readFileSync} from "node:fs";
import {createRunScopedAustralianResourcesFetch} from "../lib/stateless-run-shared-official-fetch";
import {australianResourcesIndexCandidates,verifyAustralianResourcesOriginalArticle} from "../lib/stateless-au-resources-original.server";
import {deriveStatelessSignals} from "../lib/stateless-intelligence-model";
const root="https://www.minister.industry.gov.au";
const index=root+"/king/media?type=media_releases";
const article=root+"/king/media/rare-earth-export-supply-agreement";
const now=Date.parse("2026-10-19T09:00:00.000Z");
const title="Rare earths project supports resources and energy exports";
const indexHtml='<div class="views-row">18 October 2026 <a href="'+article+'">'+title+'</a></div>';
const articleHtml="<h1>"+title+"</h1><time>18 October 2026</time><p>Official ministerial statement.</p>";
function fixture(){
 return vi.fn(async (url:RequestInfo|URL,init?:RequestInit)=>{
   expect(init?.method).toBe("GET");expect(init?.redirect).toBe("manual");
   return new Response(String(url)===index?indexHtml:articleHtml,
     {headers:{"content-type":"text/html;charset=utf-8"}});
 });
}
describe("one validated upstream source reusable in multiple categories",()=>{
 it("uses only 2 GETs for index and article while keeping two independent observations",async()=>{
   const fetchImpl=fixture(),shared=createRunScopedAustralianResourcesFetch(fetchImpl as typeof fetch);
   const [a,b]=await Promise.all([shared.fetch(index),shared.fetch(index)]);
   const macro=australianResourcesIndexCandidates(await a.text(),"macro",now);
   const minerals=australianResourcesIndexCandidates(await b.text(),"rare_earth",now);
   expect(macro).toHaveLength(1);expect(minerals).toHaveLength(1);
   const [one,two]=await Promise.all([shared.fetch(article),shared.fetch(article)]);
   expect(verifyAustralianResourcesOriginalArticle(await one.text(),macro[0],now)).toBe(true);
   expect(verifyAustralianResourcesOriginalArticle(await two.text(),minerals[0],now)).toBe(true);
   const derived=deriveStatelessSignals([...macro,...minerals],now);
   expect(derived.map(x=>x.category).sort()).toEqual(["macro","rare_earth"]);
   expect(JSON.stringify(derived)).not.toContain(article);
   expect(JSON.stringify(derived)).not.toContain(title);
   expect(fetchImpl).toHaveBeenCalledTimes(2);
   expect(shared.stats()).toEqual({unique_documents_read:2,repeat_requests_reused:2});
 });
 it("has no cache between different runs",async()=>{
   const f=fixture();
   await createRunScopedAustralianResourcesFetch(f as typeof fetch).fetch(index);
   await createRunScopedAustralianResourcesFetch(f as typeof fetch).fetch(index);
   expect(f).toHaveBeenCalledTimes(2);
 });
 it("rejects wrong host, query, HTTP and unsafe paths before fetch",async()=>{
   const f=fixture(),shared=createRunScopedAustralianResourcesFetch(f as typeof fetch);
   for(const bad of ["http://www.minister.industry.gov.au/king/media?type=media_releases",
     root+"/king/media?type=media_releases&abc=1",root+"/king/media/test",
     "https://bad.invalid/king/media?type=media_releases"]){
     await expect(shared.fetch(bad)).rejects.toThrow();
   }
   expect(f).not.toHaveBeenCalled();
   const redirect=vi.fn(async()=>new Response(null,{status:302,headers:{location:article}}));
   await expect(createRunScopedAustralianResourcesFetch(redirect as typeof fetch).fetch(index))
     .rejects.toThrow("UPSTREAM_REDIRECT_REJECTED");
   expect(redirect).toHaveBeenCalledOnce();
 });
 it("never tries a second provider GET after denial and bounds raw bytes",async()=>{
   const denied=vi.fn(async()=>new Response(null,{status:403}));
   const q=createRunScopedAustralianResourcesFetch(denied as typeof fetch);
   expect((await q.fetch(index)).status).toBe(403);
   expect((await q.fetch(index)).status).toBe(403);
   expect(denied).toHaveBeenCalledOnce();
   const giant=vi.fn(async()=>new Response("x".repeat(512*1024+1),
     {headers:{"content-type":"text/html"}}));
   expect(await (await createRunScopedAustralianResourcesFetch(giant as typeof fetch).fetch(index)).text()).toBe("");
 });
 it("publisher opts into reuse, while stateless callers remain backward compatible",()=>{
   const p=readFileSync("scripts/ops/publish-website-derived-news.ts","utf8");
   const s=readFileSync("src/lib/stateless-public-intelligence.server.ts","utf8");
   expect(p).toContain("200,sharedOfficialDocuments");
   expect(s).toContain("sharedResources.fetch(source.url)");
   expect(s).toContain("sharedResources.fetch(candidate.articleUrl)");
   expect(s).toContain("sharedResources?: RunScopedAustralianResourcesFetch");
 });
});
