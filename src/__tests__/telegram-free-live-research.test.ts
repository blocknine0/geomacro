import {describe,it,expect} from "vitest";
import {readPrivateTelegramFreeLiveJson} from "../../workers/control-plane/src/telegram-free-live-research.mjs";

const sample={
 delivery_id:"tg_"+"a".repeat(32),category:"geopolitics",country_iso3:"IND",
 topic_code:"SANCTIONS",published_at:"2026-10-26T22:00:00.000Z",
 observed_at:"2026-10-26T22:00:02.000Z",
};
const now=Date.parse("2026-10-26T22:30:00Z");
function store(rows=[sample]){
 let queries=[],values=[];
 return {env:{DB:{prepare(sql){queries.push(sql);return{bind(...params){values.push(params);return{async all(){return{results:rows}}}}}}}},
  },queries,values};
}
describe("consent-gated Telegram metadata live D1 reader",()=>{
 it("returns private hash-only unverified lead without channel or source message",async()=>{
   const state=store(),request=new URLSearchParams({category:"geopolitics",country:"IND"});
   const r=await readPrivateTelegramFreeLiveJson(state.env,request,now);
   expect(r.status).toBe(200);
   const payload=await r.json();
   expect(payload.items).toHaveLength(1);
   expect(payload.items[0]).toMatchObject({category:"geopolitics",broad_topic:"SANCTIONS",
    source_content_included:false,commercial_reuse_authorized:false,factual_news_item:false});
   expect(JSON.stringify(payload)).not.toMatch(/t\.me\/|telegram_username|raw_text|message_id|publisher_url/);
   expect(r.headers.get("cache-control")).toContain("no-store");
   expect(state.queries[0]).toContain("expires_at>?");
   expect(state.values[0].at(-1)).toBe(0);
 });
 it("rejects invented categories and unknown filters without database activity",async()=>{
   const a=store();
   for(const q of ["category=risk","country=ZZZZ","offset=11","category=macro&category=macro","q=raw"]){
    expect((await readPrivateTelegramFreeLiveJson(a.env,new URLSearchParams(q),now)).status).toBe(400);
   }
   expect(a.queries).toHaveLength(0);
 });
 it("returns 503 instead of stale synthetic data on D1 failure",async()=>{
   const broken={DB:{prepare(){throw Error("D1 down")}}};
   const response=await readPrivateTelegramFreeLiveJson(broken,new URLSearchParams(),now);
   expect(response.status).toBe(503);
   expect((await response.json()).items).toEqual([]);
 });
 it("keeps all-three-categories claims disabled even when one authorized post exists",async()=>{
   const r=await readPrivateTelegramFreeLiveJson(store().env,new URLSearchParams(),now);
   const data=await r.json();
   expect(data.all_three_categories_live_verified).toBe(false);
   expect(data.all_195_countries_live_verified).toBe(false);
 });
});
