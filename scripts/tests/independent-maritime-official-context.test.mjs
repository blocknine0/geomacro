import test from "node:test";
import assert from "node:assert/strict";
import {INDEPENDENT_MARITIME_CONTEXT_SOURCES as SOURCES,
 summarizeIndependentMaritimeIndex as parse,
 observeIndependentMaritimeOfficialContext as observe}
 from "../lib/independent-maritime-official-context.mjs";
const now=new Date("2026-10-24T01:00:00.000Z");
const marad=`<!doctype html><html><body>
 <h2>Active Advisories</h2>
 <table><tr><th>Title</th><th>Status</th><th>Effective Date</th><th>Expire Date</th></tr>
 <tr><td><a href="/msci/2026-013-red-sea-bab-el-mandeb">
 2026-013-Red Sea, Bab el Mandeb Strait, Gulf of Aden, Somali Basin-Houthi Attacks</a>
 </td><td>Active</td><td>09/23/2026</td><td>03/22/2027</td></tr>
 <tr><td>2026-014-Worldwide Cyber Influence</td>
 <td>Active</td><td>10/21/2026</td><td>04/19/2027</td></tr>
 </table><h2>Cancelled Advisories</h2>
 <div>2026-010-Gulf of Aden piracy Cancelled 08/07/2026 02/04/2027</div>
 </body></html>`;
const recaap=`<html><h1>Reports</h1>
 <div>ReCAAP ISC Weekly Report (13-19 Oct) 2026</div>
 <div>ReCAAP ISC Weekly Report (06-12 Oct) 2026</div></html>`;
const mscio=`<html><body><h1>MSCIO</h1><h2>Recent Incidents (0)</h2></body></html>`;
test("three fixed no-key sources, one independent origin each; no UKMTO",()=>{
 assert.deepEqual(SOURCES.map(x=>x.id),[
   "us_msci_maritime_advisories","recaap_isc_weekly_reports",
   "eunavfor_mscio_alerts"]);
 assert.equal(new Set(SOURCES.map(s=>s.publisher)).size,3);
 for(const s of SOURCES){const u=new URL(s.url);
   assert.equal(u.protocol,"https:");assert.equal(u.hostname,s.host);
   assert.notEqual(u.hostname,"ukmto.org");
   assert.notEqual(u.hostname,"www.ukmto.org");}
});
test("MARAD active advisory effective dates never become incident timestamps",()=>{
 const v=parse(SOURCES[0].id,marad,{now});
 assert.equal(v.index_metadata_candidate_count,2);
 assert.equal(v.latest_marad_effective_day_only,"2026-10-21");
 assert.equal(v.source_native_incident_time_verified,false);
 assert.equal(v.maritime_attack_confirmed,false);
 assert.equal(v.commercial_rights_verified,false);
 assert.equal(JSON.stringify(v).includes("Houthi"),false);
});
test("ReCAAP periodic report index and MSCIO client shell never invent events",()=>{
 const a=parse(SOURCES[1].id,recaap,{now});
 assert.equal(a.reason,"OFFICIAL_PERIODIC_REPORT_INDEX_OBSERVED");
 assert.equal(a.index_metadata_candidate_count,2);
 assert.equal(a.source_native_incident_time_verified,false);
 const b=parse(SOURCES[2].id,mscio,{now});
 assert.equal(b.reason,"OFFICIAL_MSCIO_INDEX_SHELL_OBSERVED");
 assert.equal(b.index_metadata_candidate_count,0);
 assert.equal(b.independent_same_event_corroboration_verified,false);
});
test("single shared bounded call per independent source; no raw persistence",async()=>{
 const urls=[];
 const bodies=[marad,recaap,mscio];
 const r=await observe({now,fetchImpl:async(url,opts)=>{
   urls.push(url);assert.equal(opts.redirect,"error");
   assert.equal(opts.method,"GET");
   return new Response(bodies[urls.length-1],{
    headers:{"content-type":"text/html"}});
 }});
 assert.deepEqual(urls,SOURCES.map(x=>x.url));
 assert.equal(r.http_requests,3);
 assert.equal(r.independently_accessible_publishers,3);
 assert.equal(r.ukmto_requests,0);
 assert.equal(r.individual_maritime_incidents_verified,0);
 assert.equal(r.full_195x3_verified,false);
 assert.equal(r.current_signed_intelligence_verified,false);
 assert.equal(r.source_rights_for_commercial_reuse_verified,false);
 assert.equal(r.source_report_text_stored,false);
 assert.equal(JSON.stringify(r).includes("Houthi"),false);
 assert.equal(JSON.stringify(r).includes("msci-advisories"),false);
});
test("blocked/HTML spoof redirects, wrong type, oversized and empty stay unverified",async()=>{
 const r=await observe({now,fetchImpl:async(url)=>{
   if(url===SOURCES[0].url)return new Response("denied",{status:403});
   if(url===SOURCES[1].url)
     return new Response('{"Reports":"fake"}',{headers:{"content-type":"application/json"}});
   return new Response("<html>Fake articles</html>",{
     headers:{"content-type":"text/html"}});
 }});
 assert.equal(r.independently_accessible_publishers,0);
 assert.equal(r.status,"ALL_INDEPENDENT_CONTEXT_UNVERIFIED");
 assert.equal(r.sources[0].transport_state,"DENIED_OR_QUOTA");
 assert.equal(r.sources[1].transport_state,"MIME_UNVERIFIED");
 assert.equal(r.sources[2].index_state,"SOURCE_INDEX_SHAPE_UNVERIFIED");
 assert.equal(r.payment_attempts,0);
});
test("untrusted mutated ID, invalid calendar and stale date-only never create signed event",()=>{
 const r=parse(SOURCES[0].id,marad.replace("10/21/2026","13/45/2026"),{now});
 assert.equal(r.index_metadata_candidate_count,1);
 assert.equal(r.current_signed_gro_verified,false);
 assert.throws(()=>parse("ukmto_recent_incidents",marad,{now}));
 assert.throws(()=>parse(SOURCES[1].id,"x".repeat(400_000),{now}));
});

test("untrusted script/style and malformed script closing whitespace cannot forge advisory rows",()=>{
 const injected='<html><style>2026-099-Hormuz Active 10/20/2026 11/20/2026</style>'+
   '<script type="application/json">2026-098-Red Sea Active 10/20/2026 11/20/2026'+
   '</script\t\n bar><h2>Active Advisories</h2><p>Expire Date</p>'+
   '<!-- 2026-097-Piracy Active 10/20/2026 11/20/2026 -->'+
   '<div>2026-015-Cyber Influence Active 10/21/2026 04/19/2027</div></html>';
 const got=parse(SOURCES[0].id,injected,{now});
 assert.equal(got.index_metadata_candidate_count,1);
 assert.equal(got.current_signed_gro_verified,false);
});
