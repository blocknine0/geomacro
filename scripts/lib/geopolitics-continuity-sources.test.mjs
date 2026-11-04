import test from "node:test";
import assert from "node:assert/strict";
import {geopoliticsContinuitySources} from "./geopolitics-continuity-sources.mjs";
import {threeDomainGlobal20mPublisherRegistry} from "./three-domain-global-direct-20m-sources.mjs";
import {hot50Direct20mPublisherRegistry} from "./hot-50-direct-20m-sources.mjs";

test("geopolitics failover inventory is 15 direct pinned HTTPS publisher feeds without paid activation",()=>{
 const rows=geopoliticsContinuitySources();
 assert.equal(rows.length,15);
 assert.equal(new Set(rows.map(s=>s.url)).size,15);
 for(const s of rows){
   const u=new URL(s.url);
   assert.equal(u.protocol,"https:");
   assert.deepEqual([...s.categories],["geopolitics"]);
   assert.ok(["rss","atom"].includes(s.type));
   assert.equal(s.transport_verified_at_registration,false);
   assert.equal(s.provider_rights_verified,false);
   assert.equal(s.commercial_eligible,false);
   assert.equal(s.publicly_deliverable,false);
 }
});
test("real 20-minute source registry pins every geopolitical alternate and retains category safety",()=>{
 const candidates=geopoliticsContinuitySources();
 const actual=threeDomainGlobal20mPublisherRegistry(new Date("2026-11-04T06:00:00Z"));
 const {registry,summary}=actual;
 assert.equal(summary.geopolitics_continuity_sources_pinned,15);
 assert.equal(summary.geopolitics_continuity_transport_verified_by_registration,false);
 assert.ok(registry.length<=504);
 assert.equal(new Set(registry.map(s=>s.url)).size,registry.length);
 for(const c of candidates){
   const source=registry.find(x=>x.url===c.url);
   assert.ok(source,"Missing source: "+c.id);
   assert.ok(source.categories.includes("geopolitics"));
   assert.equal(source.private_geopolitics_continuity,true);
   assert.equal(source.commercial_eligible,false);
   assert.equal(source.publicly_deliverable,false);
 }
});
test("existing hot50 source identity is stable when geopolitics priority overlaps a pinned URL",()=>{
 const source=geopoliticsContinuitySources()[0];
 const hot50=hot50Direct20mPublisherRegistry(new Date("2026-11-04T06:00:00Z")).registry;
 const already=hot50.find(s=>s.url===source.url);
 const existing={...source,id:"private_original_un_press",private_geopolitics_continuity:false};
 const {registry}=threeDomainGlobal20mPublisherRegistry(new Date("2026-11-04T06:00:00Z"),{
    hot50,
    base:[existing],
 });
 const row=registry.find(s=>s.url===source.url);
 assert.equal(row.id,already?.id??existing.id);
 assert.ok(row.categories.includes("geopolitics"));
 assert.equal(row.private_geopolitics_continuity,true);
});
