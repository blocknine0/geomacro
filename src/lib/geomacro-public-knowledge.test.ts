import {describe,expect,it} from "vitest";
import {geomacroPublicAnswer} from "./geomacro-public-knowledge";
import {executeHybridChatTurn} from "./hybrid-agent-chat.server";
import {publicCapabilityPricingCatalog} from "./capability-pricing-catalog";
import {GEOMACRO_PUBLIC_LINKS} from "./geomacro-public-links";

describe("approved public Geomacro knowledge",()=>{
 it("explains the company and its three categories",()=>{
  const a=geomacroPublicAnswer("What is Geomacro?")!;
  expect(a.answer_kind).toBe("public_info");
  expect(a.summary).toContain("global intelligence platform");
  expect(a.summary).toContain("Rare Earths");
  expect(a.evidence).toEqual([]);
 });
 it("uses every active public catalog price without selling the retired index",()=>{
  const a=geomacroPublicAnswer("What does Geomacro cost?")!;
  for(const product of publicCapabilityPricingCatalog())for(const v of product.variants)expect(a.summary).toContain("$"+v.amount_usdc);
  expect(a.summary).not.toContain("Global Risk Index");
  expect(a.summary).toContain("coming soon");
 });
 it.each(["Geomacro database passwords","Geomacro secret credentials","Geomacro internal sources list","Geomacro raw source feeds"])("declines %s using public-only content",q=>{
  const a=geomacroPublicAnswer(q)!;
  expect(a.summary).toContain("not available through public chat");
  expect(a.public_links?.every(key=>Object.hasOwn(GEOMACRO_PUBLIC_LINKS,key))).toBe(true);
  expect(a.summary).not.toContain("workers.dev");
 });
 it.each(["Who founded Geomacro?","Geomacro revenue","Geomacro legal jurisdiction?"])("does not infer unpublished detail: %s",q=>{
  const a=geomacroPublicAnswer(q)!;
  expect(a.summary).toMatch(/not (?:have|covered)/);
  expect(a.summary).not.toContain("blocknine0");
 });
 it("distinguishes the public Store from conversation storage",()=>{
  expect(geomacroPublicAnswer("What is the Geomacro Store?")?.summary).toContain("public product catalog");
  expect(geomacroPublicAnswer("Does Geomacro store my chats?")?.summary).toContain("current browser tab");
 });
 it("gives only the published support address",()=>{
  expect(geomacroPublicAnswer("How do I contact Geomacro?")?.summary).toContain("contact@geomacro.live");
 });
 it("does not replace a branded research question with a company answer",()=>{
  expect(geomacroPublicAnswer("Geomacro, what is inflation?")).toBeNull();
 });
 it("answers public pricing follow-ups through the real canonical chat core",async()=>{
  const first=await executeHybridChatTurn({question:"What is Geomacro?"},"public-brand-first");
  expect(first.answer.answer_kind).toBe("public_info");
  const next=await executeHybridChatTurn({question:"How much does it cost?",history:[{role:"user",content:first.resolved_question}]},"public-brand-cost");
  expect(next.answer.summary).toContain("Country Structural Digest: $0.02");
  expect(next.answer.summary).toContain("Risk Gate — Preflight / Standard / Complex: $0.10 / $0.15 / $0.25");
  expect(next.answer.source_identity_exposed).toBe(false);
 });
});
