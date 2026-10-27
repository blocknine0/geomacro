import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {readPrivateTelegramSignals,hasPrivateTelegramSignalReader} from "./telegram-signals-repository.server";
const url="https://producer.example.org/v1/private/telegram/signals";
const record={
 signal_id:"tg_"+"a".repeat(32),category:"MACRO",country_iso3:"IND",
 topic_code:"CENTRAL_BANK",event_family_key:"b".repeat(64),content_hash:"c".repeat(64),
 published_at:new Date().toISOString(),observed_at:new Date().toISOString()
};
const reply={schema:"geomacro.private-telegram-signals.v1",verification_status:"UNVERIFIED",
 commercial_eligible:false,source_text_retained:false,records:[record]};
describe("isolated Telegram producer is read-only to main GeoMacro",()=>{
 beforeEach(()=>{vi.stubEnv("GEOMACRO_TELEGRAM_SIGNALS_READ_URL",url);
   vi.stubEnv("GEOMACRO_TELEGRAM_SIGNALS_READ_TOKEN","r".repeat(40))});
 afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals()});
 it("uses only bearer-authenticated GET and validates private metadata",async()=>{
  const fetcher=vi.fn(async()=>new Response(JSON.stringify(reply),
   {headers:{"content-type":"application/json"}}));
  vi.stubGlobal("fetch",fetcher);
  expect(hasPrivateTelegramSignalReader()).toBe(true);
  const rows=await readPrivateTelegramSignals({country_iso3:"IND",category:"macro"});
  expect(rows).toHaveLength(1);
  const [destination,options]=fetcher.mock.calls[0] as unknown as [string,RequestInit];
  expect(new URL(destination).searchParams.get("category")).toBe("macro");
  expect(options.method).toBe("GET");
  expect(options.body).toBeUndefined();
  expect(rows[0]).not.toHaveProperty("source_channel_key");
 });
 it("rejects attempts to smuggle raw Telegram or verified facts",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>Response.json({...reply,headline:"untrusted content"})));
  await expect(readPrivateTelegramSignals({country_iso3:"IND",category:"macro"})).rejects.toThrow();
 });
 it("rejects stale data even if producer reported it",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>Response.json({...reply,records:[
   {...record,published_at:"2020-01-01T00:00:00Z"}]})));
  await expect(readPrivateTelegramSignals({country_iso3:"IND",category:"macro"})).rejects.toThrow();
 });
 it("blocks private network address and unknown countries before fetch",async()=>{
  vi.stubEnv("GEOMACRO_TELEGRAM_SIGNALS_READ_URL","http://localhost/v1/private/telegram/signals");
  expect(hasPrivateTelegramSignalReader()).toBe(false);
  vi.stubGlobal("fetch",vi.fn());
  await expect(readPrivateTelegramSignals({country_iso3:"IND",category:"macro"})).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
 });
});
