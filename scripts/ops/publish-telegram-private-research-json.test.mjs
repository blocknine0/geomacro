import test from "node:test";
import assert from "node:assert/strict";
import {verifyAuthorizedTelegramResearchLead,authorizedTelegramResearchSql} from "./publish-telegram-private-research-json.mjs";
import {readPrivateTelegramResearchJson} from "../../workers/control-plane/src/telegram-research-json.mjs";

const NOW=new Date("2026-10-25T00:00:00.000Z");
const signal="tg_"+"a".repeat(32),digest="b".repeat(64);
const row={delivery_id:signal+"_"+digest.slice(0,16),signal_id:signal,
 b2_sha256:digest,source_channel_key:"approvedgov",source_record_id:12,
 published_at:"2026-10-24T23:54:00.000Z",queue_state:"PENDING",
 verification_status:"UNVERIFIED",scoring_eligible:false,commercial_eligible:false};
const payload={source_id:"telegram_authorized_publisher_feed",
 source_channel_key:"approvedgov",source_record_id:12,
 published_at:row.published_at,signal_category:"CRITICAL_MINERALS",
 country_iso3:"IND",headline:"TELEGRAM_LEAD_METADATA_ONLY",
 source_url:null,raw_payload:null,verification_status:"UNVERIFIED"};
test("accepted signed-B2/D1 handoff produces country- and domain-tagged private-only research JSON",()=>{
 const result=verifyAuthorizedTelegramResearchLead(row,payload,NOW);
 assert.deepEqual(result,{
  delivery_id:row.delivery_id,category:"rare_earth",country_iso3:"IND",
  published_at:row.published_at});
 const sql=authorizedTelegramResearchSql(result,NOW);
 assert.match(sql,/JOIN telegram_signal_lead_queue q/);
 assert.match(sql,/q.state='CONSUMED'/);
 assert.match(sql,/l.verification_status='UNVERIFIED'/);
 assert.match(sql,/q.b2_sha256=l.b2_sha256/);
 assert.doesNotMatch(sql,/CREATE|source_url|raw_payload|INSERT INTO reusable_news_items|UPDATE.*commercial_eligible/);
});
test("fake commercial authorization, raw source URL, copied headline and stale/expired data refused",()=>{
 const changes=[
  [{...row,commercial_eligible:true},payload],
  [row,{...payload,source_url:"https://t.me/approvedgov/12"}],
  [row,{...payload,headline:"I have new full copied article"}],
  [row,{...payload,raw_payload:"Original message body"}],
  [row,{...payload,signal_category:"UNKNOWN"}],
  [row,{...payload,country_iso3:"PERSON"}],
  [{...row,delivery_id:signal+"_deadbeefdeadbeef"},payload],
  [{...row,published_at:"2026-10-20T00:00:00.000Z"},
   {...payload,published_at:"2026-10-20T00:00:00.000Z"}],
 ];
 for(const [item,data] of changes)
  assert.throws(()=>verifyAuthorizedTelegramResearchLead(item,data,NOW));
});
test("private research JSON reader is bounded, uns cored, never a paid/live country claim",async()=>{
 const fake={DB:{prepare(sql){
   assert.match(sql,/telegram_research_json/);
   const obj={bind(){return obj},async all(){return {results:[
     {delivery_id:row.delivery_id,category:"rare_earth",country_iso3:"IND",published_at:row.published_at},
   ]}}};return obj;
 }}};
 const res=await readPrivateTelegramResearchJson(fake,new URLSearchParams("country=IND&category=rare_earth"),NOW.getTime());
 assert.equal(res.status,200);
 const doc=await res.json();
 assert.equal(doc.items.length,1);
 assert.equal(doc.items[0].unverified_research_lead,true);
 assert.equal(doc.items[0].source_content_included,false);
 assert.equal(doc.items[0].commercial_reuse_authorized,false);
 assert.equal(doc.public_news_reuse_authorized,false);
 assert.equal(doc.chargeable,false);
 assert.ok(!JSON.stringify(doc).includes("approvedgov"));
});
test("reader rejects arbitrary SQL scope and country injection",async()=>{
 const db={DB:{prepare(){throw Error("DATABASE_SHOULD_NOT_BE_READ")}}};
 for(const qs of ["view=raw","category=finance","country=IND%27%20OR%201%3D1",
                  "offset=1","country=IND&country=USA"]){
  const res=await readPrivateTelegramResearchJson(db,new URLSearchParams(qs),NOW.getTime());
  assert.equal(res.status,400);
 }
});
