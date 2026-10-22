import {describe,it,expect} from "vitest";
import {releaseNewsObservation} from "../lib/release-news-observation";
import {deriveStatelessSignals} from "../lib/stateless-intelligence-model";
import {publicHeadline} from "../lib/intelligence-editorial";

describe("derived release news without invented outcomes",()=>{
 it("distinguishes an appeal from an achieved ceasefire",()=>{
  const result=releaseNewsObservation("UN calls for immediate ceasefire in Sudan");
  expect(result?.headline).toBe("Call for a ceasefire");
  expect(result?.change).toContain("does not establish that fighting has stopped");
 });
 it("does not promote negated, quoted or hypothetical action",()=>{
  for(const text of ["Canada denies it announces sanctions on Russia",
   "India could cut interest rates",'Minister asks: "Who calls for ceasefire?"',
   "China may introduce new export controls", "UK rejects new sanctions"])
   expect(releaseNewsObservation(text)).toBeNull();
 });
 it("preserves the distinction between a proposal and an announcement",()=>{
  expect(releaseNewsObservation("China proposes new export controls")?.change)
   .toContain("does not establish that they are in force");
  expect(releaseNewsObservation("China announces new export controls")?.headline)
   .toBe("Trade restrictions announced");
 });
 it("keeps unmatched updates limited and never copies raw text",()=>{
  expect(releaseNewsObservation("PRIVATE HEADLINE about diplomacy in Canada")).toBeNull();
 });
 it("uses actual derived action and an explicit country while preserving original clocks",()=>{
  const at="2026-10-19T08:00:00.000Z", now=Date.parse("2026-10-19T12:00:00.000Z");
  const [signal]=deriveStatelessSignals([{sourceId:"uk_fcdo",category:"geopolitics",
    title:"UK announces new sanctions on Russia",articleUrl:"https://www.gov.uk/a-specific-release",
    publishedAt:at,credit:null}],now);
  expect(signal.title).toContain("United Kingdom");
  expect(signal.title).toContain("announced new sanctions on Russia");
  expect(signal.title).not.toContain("\u2014");
  expect(signal.geography).toBe("United Kingdom");
  expect(signal.what_changed).toContain("United Kingdom announced new sanctions on Russia");
  expect(signal.published_at).toBe(at);
  expect(signal.same_event_corrob_verified).toBe(false);
  expect(signal.severity).toBeNull();
 });
 it("removes em dashes from existing display headlines",()=>{
  expect(publicHeadline("Geomacro finds Policy update — India")).toBe("Policy update; India");
 });
});


it("retains genuine pre-style-update private references while newly rendered content gets a new signature",async()=>{
 const {generateKeyPairSync}=await import('node:crypto');
 const {signAutomatedIntelligenceInput}=await import('../lib/risk-object-signing.server');
 const {automatedInputId}=await import('../lib/automated-intelligence-input');
 const {verifyPrivateSourceHandoff}=await import('../lib/private-source-handoff');
 const pair=generateKeyPairSync('ed25519'),now=Date.now();
 const material={key_id:'editorial-transition-test',public_key_spki_b64:pair.publicKey.export({format:'der',type:'spki'}).toString('base64'),
  private_key_pkcs8_b64:pair.privateKey.export({format:'der',type:'pkcs8'}).toString('base64')};
 const ref={sourceId:'uk_fcdo',category:'geopolitics' as const,title:'UK announces new sanctions on Russia',
  articleUrl:'https://www.gov.uk/government/news/test-sanctions-measures',publishedAt:new Date(now-3600000).toISOString(),credit:null};
 const legacy=deriveStatelessSignals([ref],now,{editorialVersion:'legacy_v1'})[0];
 const revised=deriveStatelessSignals([ref],now)[0];
 expect(legacy.id).toBe(revised.id);expect(legacy.published_at).toBe(revised.published_at);
 expect(await automatedInputId(legacy)).not.toBe(await automatedInputId(revised));
 // A second public UI ID is the same exact signed content identity.
 const alias={...legacy,id:'geopolitics-deadbeef'};
 expect(await automatedInputId(alias)).toBe(await automatedInputId(legacy));
 const {refreshRetainedSignal}=await import('../../scripts/ops/refresh-derived-news-editorial');
 const refreshed=refreshRetainedSignal(alias,ref,now);
 expect(refreshed.id).toBe(alias.id);
 expect(refreshed.published_at).toBe(alias.published_at);
 expect(await automatedInputId(refreshed)).toBe(await automatedInputId(revised));
 expect(()=>refreshRetainedSignal({...alias,published_at:new Date(now-7200000).toISOString()},ref,now)).toThrow('CLOCK');
 for(const signal of [legacy,revised]){
  const envelope=await signAutomatedIntelligenceInput({schema:'geomacro.automated-intelligence-input.v1',
   approval_mode:'AUTOMATED_INGESTION',approved_for:'derived_intelligence_input',generated_at:new Date(now).toISOString(),
   expires_at:new Date(Date.parse(ref.publishedAt)+72*3600000).toISOString(),source_run_id:'1',source_sha:'a'.repeat(40),
   independent_reviewed:false,commercial_rights_attested:false,scored:false,signal},material);
  const item={input_id:await automatedInputId(signal),ref};
  await expect(verifyPrivateSourceHandoff(item,envelope,{[material.key_id]:material.public_key_spki_b64},now)).resolves.toBeTruthy();
 }
});

it("renders the screenshot's committee-hearing story as attributed actor/action facts",()=>{
 const now=Date.now(),publishedAt=new Date(now-3600000).toISOString();
 const ref={sourceId:'un_press_global',category:'geopolitics' as const,
  title:'‘War on Narco-Terrorism’ Fuels Unlawful Killings, Third Committee Hears, as Experts Warn of Mass Displacement, Attacks on Justice ',
  articleUrl:'https://press.un.org/en/2026/gashc00000.doc.htm',publishedAt,credit:'United Nations'};
 const [signal]=deriveStatelessSignals([ref],now);
 const [legacy]=deriveStatelessSignals([ref],now,{editorialVersion:'legacy_v1'});
 expect(signal.id).toBe(legacy.id);expect(signal.published_at).toBe(publishedAt);
 expect(signal.what_changed).toContain('Experts told');
 expect(signal.what_changed).toContain('Third Committee');
 expect(signal.what_changed).toContain('unlawful killings');
 expect(signal.what_changed).not.toContain('An official publisher');
 expect(legacy.what_changed).toContain('An official publisher');
 expect(signal.geography).toBeNull();
 expect(signal.same_event_corrob_verified).toBe(false);expect(signal.severity).toBeNull();
});
