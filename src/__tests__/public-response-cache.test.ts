import {describe,expect,it} from "vitest";
import {publicResponseCache} from "../../server/api/public/public-response-cache.server";

function event(ifNoneMatch?:string){
 const headers:Record<string,string>={};
 const response={statusCode:200,setHeader:(name:string,value:string)=>{headers[name.toLowerCase()]=value}};
 return {node:{req:{headers:ifNoneMatch?{"if-none-match":ifNoneMatch}:{}},res:response},
  headers,response};
}

describe("public snapshot HTTP cache",()=>{
 it("coalesces duplicate producer calls and serves a bodyless ETag 304",async()=>{
  let reads=0;
  const produce=async()=>{reads++;await new Promise(r=>setTimeout(r,5));return {ok:true,signals:[
   {category:"geopolitics",status:"official_release_observed_unscored"},
   {category:"macro",status:"official_release_observed_unscored"},
   {category:"rare_earth",status:"osint_feed_observed_unverified"}]};};
  const a=event(),b=event();
  const [first,second]=await Promise.all([
   publicResponseCache(a as never,"test-three-category",produce,1000),
   publicResponseCache(b as never,"test-three-category",produce,1000)]);
  expect(reads).toBe(1);
  expect(first).toEqual(second);
  const etag=a.headers.etag;
  expect(etag).toMatch(/^"sha256-[a-f0-9]{64}"$/u);
  const conditional=event(etag);
  const notModified=await publicResponseCache(conditional as never,
   "test-three-category",produce,1001);
  expect(notModified).toBeNull();
  expect(conditional.response.statusCode).toBe(304);
  expect(conditional.headers.etag).toBe(etag);
  expect(reads).toBe(1);
 });

 it("does not cache error envelopes",async()=>{
  let reads=0;
  const produce=async()=>({ok:false,error:"INTELLIGENCE_UNAVAILABLE",attempt:++reads});
  const a=event(),b=event();
  await publicResponseCache(a as never,"test-error",produce,1000);
  await publicResponseCache(b as never,"test-error",produce,1001);
  expect(reads).toBe(2);
  expect(b.headers["cache-control"]).toBe("no-store");
 });
});
