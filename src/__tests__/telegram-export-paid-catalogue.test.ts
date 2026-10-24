import {describe,expect,it} from "vitest";
import {assessOwnerTelegramExportIntelligenceQuery,
 safeOwnerTelegramExportCustomerClaim,
 TELEGRAM_EXPORT_UNVERIFIED_LIMITATION} from "@/lib/telegram-export-paid-eligibility";
import {resolveGeomacroCapabilityPrice} from "@/lib/capability-pricing-catalog";

const now=Date.parse("2026-10-25T00:00:00.000Z");
const row={
 schema_version:"geomacro.telegram-export-derived.v1",
 category:"macro",topic_code:"INFLATION",country_iso3:"IND",
 event_type:"INFLATION",
 derived_summary:"Macro/FX claim mentions an inflation indicator; unverified export-derived research only.",
 source_native_published_at:"2026-10-24T19:00:00.000Z",
 time_quality:"EXACT" as const,observed_at:"2026-10-24T19:05:00.000Z",
 provenance:"TELEGRAM_PUBLIC_EXPORT",
 rights_state:"OWNER_DECLARED_TELEGRAM_DERIVED_ONLY",
 verification_status:"UNVERIFIED_CLAIM",
 confidence:0.65,scored:false,execution_authorized:false,
};
const input={country_iso3:"IND",topics:["macro_risk"],variant:"focused",rows:[row],
 distinct_private_chat_count:1,now,feature_flag:"true"};
describe("Telegram owner-export T3 no-funds catalogue mapping",()=>{
 it("flag OFF strictly nonchargeable, no quote even with data",()=>{
  const r=assessOwnerTelegramExportIntelligenceQuery({...input,feature_flag:undefined});
  expect(r).toMatchObject({eligible:false,chargeable:false,
   quote_authorized:false,status:"TELEGRAM_DERIVED_PAID_DISABLED"});
 });
 it("exact locked existing USDC price atomic units for all three intelligence_query variants",()=>{
  const mapping=[["focused","0.05","50000"],
    ["standard","0.10","100000"],["complex_multi_source","0.15","150000"]] as const;
  for(const [variant,price,atomic] of mapping){
   const catalog=resolveGeomacroCapabilityPrice("intelligence_query",variant);
   expect(catalog.amount_usdc).toBe(price);
   expect(catalog.amount_atomic).toBe(atomic);
   const out=assessOwnerTelegramExportIntelligenceQuery({...input,variant,
    distinct_private_chat_count:2});
   expect(out).toMatchObject({eligible:true,quote_authorized:false,
    chargeable:false,price_usdc:price,price_atomic:atomic,
    verification_status:"UNVERIFIED_CLAIM",
    source_rights_verified:false});
  }
 });
 it("multi-source requirement is two DISTINCT private chats, no chat ID is output",()=>{
  const r=assessOwnerTelegramExportIntelligenceQuery({...input,
    variant:"complex_multi_source",distinct_private_chat_count:1});
  expect(r).toMatchObject({eligible:false,
   status:"TELEGRAM_EXPORT_SECOND_INDEPENDENT_CHAT_MISSING"});
  expect(JSON.stringify(r)).not.toContain("internal_chat_fingerprint");
 });
 it("focused timestamp UNKNOWN_TZ and stale or country mismatch never qualify",()=>{
  expect(assessOwnerTelegramExportIntelligenceQuery({...input,
    rows:[{...row,time_quality:"UNKNOWN_TZ",source_native_published_at:null}]}))
     .toMatchObject({eligible:false});
  expect(assessOwnerTelegramExportIntelligenceQuery({...input,
    rows:[{...row,observed_at:"2026-10-16T00:00:00.000Z"}]}))
     .toMatchObject({eligible:false});
  expect(assessOwnerTelegramExportIntelligenceQuery({...input,country_iso3:"USA"}))
     .toMatchObject({eligible:false});
 });
 it("no signed capability is introduced and unverified export never becomes a current Risk Object",()=>{
  const r=assessOwnerTelegramExportIntelligenceQuery({...input,
    variant:"gri_read"});
  expect(r.eligible).toBe(false);
  for(const v of ["signed_risk_object","risk_gate_bundle"]){
   expect(()=>resolveGeomacroCapabilityPrice(v,"focused")).toThrow();
  }
 });
 it("buyer projection contains only strictly curated labels and no author, links or handles",()=>{
  const out=safeOwnerTelegramExportCustomerClaim(row,now);
  expect(out.limitation).toBe(TELEGRAM_EXPORT_UNVERIFIED_LIMITATION);
  expect(out).toMatchObject({provenance:"TELEGRAM_PUBLIC_EXPORT",
   verification_status:"UNVERIFIED_CLAIM",scored:false});
  for(const s of ["@privatetelegram","9999999","https://t.me","internal_chat_fingerprint"]){
   expect(JSON.stringify(out)).not.toContain(s);
  }
 });
});
