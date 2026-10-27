import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const workflow=name=>readFileSync(new URL("../../.github/workflows/"+name,import.meta.url),"utf8");

test("critical private OSINT and research both require same finite Cloudflare admission",()=>{
 const file=workflow("private-global-osint-15m.yml");
 assert.match(file,/quota-admission:/);
 assert.match(file,/needs: \[verify, quota-admission\]/);
 assert.match(file,/needs\.quota-admission\.outputs\.critical == 'true'/);
 assert.match(file,/needs\.quota-admission\.outputs\.research == 'true'/);
 assert.match(file,/plan-d1-bundled-work\.mjs/);
});
test("registered source bulk JSON writer requires account-wide headroom before source fetch",()=>{
 const file=workflow("all-source-reusable-news-json.yml");
 assert.match(file,/if: steps\.quota\.outputs\.critical == 'true'/);
 assert.match(file,/run: bun scripts\/ops\/plan-d1-bundled-work\.mjs/);
 assert.match(file,/if: steps\.quota\.outputs\.critical != 'true'/);
 assert.match(file,/all-source-reusable-news-json\.ts/);
});
test("hourly and fallback derived source work do not burn P0 ingestion reserve",()=>{
 for(const name of ["website-derived-news-continuity.yml","website-derived-news-cadence-backstop.yml"]){
   const w=workflow(name);
   assert.match(w,/quota-admission:/);
   assert.match(w,/needs\.quota-admission\.outputs\.research == 'true'/);
   assert.match(w,/plan-d1-bundled-work\.mjs/);
 }
 const continuity=workflow("website-derived-news-continuity.yml");
 assert.match(continuity,/needs\.quota-admission\.outputs\.maintenance == 'true'/);
});
test("daily governed B2/source workflow cannot use protected D1 above maintenance threshold",()=>{
 const file=workflow("governed-source-ingestion.yml");
 assert.match(file,/needs: quota-admission/);
 assert.match(file,/needs\.quota-admission\.outputs\.maintenance == 'true'/);
 assert.match(file,/plan-d1-bundled-work\.mjs/);
});
test("all source and private OSINT publishers are bounded by active Worker limits",()=>{
 const news=readFileSync(new URL("../lib/prepare-reusable-news-batches.mjs",import.meta.url),"utf8");
 const osint=readFileSync(new URL("../lib/private-osint-15m-durable-publisher.mjs",import.meta.url),"utf8");
 assert.match(news,/items:40,checks:48,bytes:60_000/);
 assert.match(osint,/group\.items\.length<20/);
 assert.match(osint,/group\.checks\.length<32/);
 assert.match(osint,/byteSize\(group\)>60_000/);
});
