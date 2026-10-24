import {describe,expect,it} from "vitest";
import {sanitizePublicPaidOutput,assertPublicPaidOutputBoundary}
 from "@/lib/public-paid-output-boundary";

const sourceFree={
 provenance:"TELEGRAM_PUBLIC_EXPORT",
 verification_status:"UNVERIFIED_CLAIM",
 derived_summary:"Macro/FX claim mentions monetary policy; unverified export-derived research only.",
 confidence:0.65,as_of:"2026-10-24T19:00:00.000Z",
 limitation:"Derived from an unverified public Telegram post; not independently confirmed.",
 scored:false,execution_authorized:false,
};
describe("T3 Telegram file-derived paid-output privacy boundary",()=>{
 it("preserves exact source-neutral provenance and unverified disclosure labels",()=>{
  const value={claims:[sourceFree]};
  const sanitized=sanitizePublicPaidOutput(value,{rejectEmbeddedLinks:true});
  expect(sanitized).toEqual(value);
  expect(()=>assertPublicPaidOutputBoundary(sanitized)).not.toThrow();
 });
 it.each([
  {sender_name:"Secret Person"},
  {message_id:123456},
  {post_link:"https://t.me/privatechannel/12345"},
  {channel_handle:"@privatechannel"},
  {internal_chat_fingerprint:"a".repeat(64)},
  {media_reference:"private-avatar"},
  {from:"personal name"},
  {derived_summary:"Telegram copied original message text word for word"},
  {verification_status:"VERIFIED"},
  {execution_authorized:true},
 ])("refuses leaked content or promotions before quote %j",(override)=>{
  const invalid={...sourceFree,...override};
  expect(()=>sanitizePublicPaidOutput({claims:[invalid]},{rejectEmbeddedLinks:true})).toThrow();
  expect(()=>assertPublicPaidOutputBoundary({claims:[invalid]})).toThrow();
 });
 it("still forbids any unreviewed upstream URI embedded in allowed field",()=>{
  const invalid={...sourceFree,limitation:"Read at https://t.me/s/secret"};
  expect(()=>sanitizePublicPaidOutput({claims:[invalid]},{rejectEmbeddedLinks:true})).toThrow();
 });
});
