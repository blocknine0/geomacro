import {describe,it,expect,vi} from "vitest";
import worker from "../../workers/control-plane/src/index.mjs";

describe("P0 Website D1 materialized real Worker route smoke",()=>{
 const env=()=>({DB:{
  prepare(_sql:string){
   const bound={
    bind(..._args:unknown[]){return this;},
    async all(){return {results:[]}},
    async first(){return null},
    async run(){return {success:true}},
   };
   return bound;
  }
 }});
 const ctx={waitUntil(_p:Promise<unknown>){}} as any;
 it.each([
  "/v1/public/website-derived-news-immediate",
  "/v1/public/website-derived-news-immediate?offset=250",
  "/v1/public/website-derived-news",
  "/v1/public/website-derived-news-bundle",
  "/v1/public/derived-structural-72h",
 ])("no-cache public news route %s actually executes (not 500)",async path=>{
  const request=new Request("https://geomacro-control-plane.example"+path,{
   headers:{"Cache-Control":"no-cache"}
  });
  const response=await worker.fetch(request,env() as any,ctx);
  expect(response.status,JSON.stringify({
   path,reply_status:response.status,
   data:await response.clone().json().catch(()=>null)
  })).toBe(200);
 });
});
