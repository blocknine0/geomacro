import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {projectTelegramExport,containsVerbatimSpan} from "./telegram-export-derived-json.mjs";
import {validateOwnerTelegramExportFileOnly} from "./telegram-export-network-audit.mjs";
import {writeOwnerTelegramExportJson,privateOwnerTelegramExportJson}
 from "../../workers/control-plane/src/telegram-export-derived-json.mjs";
const NOW=Date.parse("2026-10-25T00:00:00.000Z");
const ID="ULTRAPRIVATE_SENDER_92748923";
const HANDLE="@secret_example_person";
const SECRET="ULTRAPRIVATE_POST_CONTENT_NEVER_REPRODUCE";
const single={name:HANDLE,id:92748923,type:"public_channel",messages:[
  {id:94729831,type:"message",date:"2026-10-24T21:00:00",
    date_unixtime:"1792875600",from:ID,
    text:"IND central bank interest rate changed 7 percent "+SECRET},
  {id:94729832,type:"message",date:"2026-10-24T21:02:00",
    date_unixtime:"1792875720",from:ID,
    text:["IND inflation policy announced ",{type:"plain",text:"4 percent, details "+SECRET}]},
  {id:94729833,type:"message",date:"2026-10-24T21:03:00",
    date_unixtime:"1792875780",from:ID,
    text:"IND central bank interest rate changed 7 percent "+SECRET},
  {id:94729834,type:"service",text:"IND central bank interest rate changed 7 percent "+SECRET},
  {id:94729835,type:"message",text:"",date_unixtime:"1792875780"},
  {id:94729836,type:"message",text:"just an unrelated conversation about gardening",date_unixtime:"1792875780"},
]};
const run=(value,countries=new Set(["IND"]))=>projectTelegramExport(Buffer.from(JSON.stringify(value)),{
  now:NOW,countryCodes:countries,
});
test("single/multichat strings and text objects, service and duplicated text skipped",()=>{
 const a=run(single);assert.equal(a.schema,"geomacro.telegram-export-project.v1");
 assert.equal(a.items.length,2);
 assert(a.items.every(x=>x.category==="macro"&&x.rights_state==="OWNER_DECLARED_TELEGRAM_DERIVED_ONLY"));
 assert(a.items.every(x=>x.country_iso3==="IND"&&x.verification_status==="UNVERIFIED_CLAIM"));
 const b=run({chats:{list:[single,{...single,id:123,name:"new-channel",
 messages:[{id:94729900,type:"message",
  date_unixtime:"1792875000",text:"IND lithium mining policy issued for 12 tonnes"}]}]}});
 assert.equal(b.items.length,3);
 assert(b.items.some(x=>x.category==="rare_earth"));
});
test("no invented timezone, no country guess, category NONE dropped",()=>{
 const d=run({messages:[{type:"message",date:"2026-10-24T21:02:00",
 text:"Central bank interest rates and monetary policy changed 3 percent"}]});
 assert.equal(d.items.length,1);assert.equal(d.items[0].source_native_published_at,null);
 assert.equal(d.items[0].time_quality,"UNKNOWN_TZ");assert.equal(d.items[0].country_iso3,null);
 assert.equal(d.items[0].scored,false);
});
test("reject long verbatim quote and avoid output/log/errors leaks",()=>{
 assert.equal(containsVerbatimSpan("The government announced another monetary intervention today",
 "A headline says the government announced another monetary intervention today."),true);
 const x=run(single);
 const serialized=JSON.stringify(x);
 for(const secret of [HANDLE,ID,SECRET,"94729831","92748923",
  "IND central bank interest rate changed 7 percent"]){
  assert(!serialized.includes(secret),"Sensitive source content escaped projection");
 }
 assert.throws(()=>projectTelegramExport(Buffer.from('{"chats": {"list": "oops"}}'),{
   now:NOW,countryCodes:new Set()}),e=>e.message==="TELEGRAM_EXPORT_PARSE_FAILED_CLOSED");
});
test("bounded category classifier never invents ambiguous geography or confidence of truth",()=>{
 const x=run({messages:[{type:"message",date_unixtime:"1792875600",
 text:"IND military conflict and inflation report mixed with lithium mining"}]});
 assert.equal(x.items.length,0);
 const y=run({messages:[{type:"message",date_unixtime:"1792875600",
 text:"IND USA central bank interest rate changed 4 percent"}]},new Set(["IND","USA"]));
 assert.equal(y.items[0].country_iso3,null);
 assert.equal(y.items[0].confidence,0.65);
});
test("no Telegram API, MTProto, t.me or source network fetch can be added to ingestion",()=>{
 const files=Object.fromEntries([
  "scripts/lib/telegram-export-derived-json.mjs",
  "scripts/ops/telegram-export-ingest.mjs",
  "workers/control-plane/src/telegram-export-derived-json.mjs",
 ].map(path=>[path,readFileSync(path,"utf8")]));
 const adr=readFileSync("docs/adr/ADR-TELEGRAM-DERIVED-COMMERCIAL-USE.md","utf8");
 const policy=readFileSync("scripts/commercial-source-policy.mjs","utf8");
 assert.equal(validateOwnerTelegramExportFileOnly(files,adr,policy).pass,true);
 for(const attack of [
  'const c = await import("telegram");',
  'const c = require("telethon");',
  'fetch("https://api.telegram.org/bot999/getUpdates");',
  'fetch("https://t.me/s/secret");',
  'new TelegramClient("session");',
 ]){
  const mutated={...files,"scripts/ops/telegram-export-ingest.mjs":files["scripts/ops/telegram-export-ingest.mjs"]+"\n"+attack};
  assert.throws(()=>validateOwnerTelegramExportFileOnly(mutated,adr,policy),
    /TELEGRAM_EXPORT_AUDIT_FORBIDDEN_TELEGRAM_NETWORK/);
 }
});
test("D1 owner export writer refuses raw/foreign data and cannot assert a verified licence",async()=>{
 const x=run(single);
 const fake={DB:{batch:async()=>{},prepare:()=>({
  bind(){return this},first:async()=>null,
 })}};
 const good={schema:"geomacro.telegram-export-derived-batch.v1",
  object_sha256:"c".repeat(64),items:x.items};
 // Missing D1 .all prevents successful read and does not imply publication.
 const res=await writeOwnerTelegramExportJson(fake,good,NOW);
 assert.equal(res.status,503);
 const bad={...good,items:[{...x.items[0],
  derived_summary:"@"+"person here is raw copied source material"}]};
 await assert.rejects(()=>writeOwnerTelegramExportJson(fake,bad,NOW),
  /TELEGRAM_EXPORT_DERIVED_BATCH_INVALID/);
 const hidden=await privateOwnerTelegramExportJson(fake,new URLSearchParams("offset=1"),NOW);
 assert.equal(hidden.status,400);
});


test("exact canonical country name yields ISO3, multi-country mention remains null",()=>{
 const named=[{iso3:"IND",name:"India",aliases:[]},
  {iso3:"CAN",name:"Canada",aliases:[]}];
 const scope={now:NOW,countryCodes:new Set(["IND","CAN"]),countryRegistry:named};
 const one=projectTelegramExport(Buffer.from(JSON.stringify({
  messages:[{type:"message",date_unixtime:"1792875600",
   text:"India central bank interest rate changed by 4 percent"}],
 })),scope);
 assert.equal(one.items[0].country_iso3,"IND");
 const two=projectTelegramExport(Buffer.from(JSON.stringify({
  messages:[{type:"message",date_unixtime:"1792875600",
   text:"India and Canada central bank interest rates changed by 4 percent"}],
 })),scope);
 assert.equal(two.items[0].country_iso3,null);
});
