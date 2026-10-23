import {describe,it,expect} from 'vitest';
import {websiteHistoricalRiskView,newestWebsiteRiskSnapshot} from '../lib/website-historical-risk-view';
import {validateGlobalRiskContinuity} from '../lib/global-risk-continuity';
import type {GlobalRisk,RiskDomainReading,Timeframe} from '../lib/global-risk.types';
import {fixture,shiftedFixture,HOUR,AS_OF} from "./fixtures/verified-global-risk";

describe('immutable archived GRI ages into a website last-verified view',()=>{
 it('demotes expired display labels only, preserving all scores, hashes, series and original dates',()=>{
  const risk=fixture(),before=JSON.stringify(risk),now=AS_OF+8*86400_000;
  expect(validateGlobalRiskContinuity(risk,now)).toMatchObject({ok:false});
  const view=websiteHistoricalRiskView(risk,now)!;
  expect(view).not.toBeNull();expect(validateGlobalRiskContinuity(view,now)).toEqual({ok:true});
  expect(Object.values(view.domainIndices).every(x=>x?.readingStatus==='last_verified')).toBe(true);
  const restored={...view,domainIndices:Object.fromEntries(Object.entries(view.domainIndices).map(([k,v])=>[k,{...v,readingStatus:'current'}]))};
  expect(restored).toEqual(risk);expect(JSON.stringify(risk)).toBe(before);
 });
 it('preserves the exact current-window boundary and never upgrades a wrong last-verified label',()=>{
  const risk=fixture();expect(websiteHistoricalRiskView(risk,AS_OF+6*HOUR)).toBe(risk);
  expect(websiteHistoricalRiskView(risk,AS_OF+6*HOUR+1)?.domainIndices.macro?.readingStatus).toBe('last_verified');
  risk.domainIndices.macro!.readingStatus='last_verified';
  expect(websiteHistoricalRiskView(risk,AS_OF+2*HOUR)).toBeNull();
 });
 it('cannot rescue a bad proof/history, under-embargo, future snapshot',()=>{
  const now=AS_OF+8*86400_000;
  for(const mutate of [(x:GlobalRisk)=>{x.proofHash='invalid'},
    (x:GlobalRisk)=>{x.domainIndices.macro!.series['7D'].buckets=[]},
    (x:GlobalRisk)=>{x.domainIndices.macro!.readingStatus='invalid' as any}]){
   const x=fixture();mutate(x);expect(websiteHistoricalRiskView(x,now)).toBeNull();
  }
  expect(websiteHistoricalRiskView(fixture(),AS_OF+59*60_000)).toBeNull();
  expect(websiteHistoricalRiskView(fixture(),AS_OF-1)).toBeNull();
  expect(websiteHistoricalRiskView(fixture(),AS_OF+365*86400_000)?.snapshotAsOf).toBe(fixture().snapshotAsOf);
 });
});


describe("website GRI chooses the newest eligible source clock",()=>{
 it("a successful old archive cannot mask a newer verified eligible edge package",()=>{
  const archive=fixture(),edge=shiftedFixture(2),now=AS_OF+4*HOUR;
  expect(newestWebsiteRiskSnapshot([archive,edge],now)?.snapshotAsOf).toBe(edge.snapshotAsOf);
  expect(newestWebsiteRiskSnapshot([edge,archive],now)?.snapshotAsOf).toBe(edge.snapshotAsOf);
 });
 it("an under-embargo edge result cannot replace the last eligible archive",()=>{
  const archive=fixture(),edge=shiftedFixture(3.5),now=AS_OF+4*HOUR;
  expect(newestWebsiteRiskSnapshot([archive,edge],now)?.snapshotAsOf).toBe(archive.snapshotAsOf);
 });
 it("invalid newest proof cannot hide an older verified result",()=>{
  const archive=fixture(),edge=shiftedFixture(2);edge.proofHash="invalid";
  expect(newestWebsiteRiskSnapshot([archive,edge],AS_OF+4*HOUR)?.snapshotAsOf).toBe(archive.snapshotAsOf);
 });
 it("an outage retains the same dated history and ages only the display status",()=>{
  const archive=fixture(),before=JSON.stringify(archive),now=AS_OF+20*HOUR;
  const selected=newestWebsiteRiskSnapshot([null,archive],now)!;
  expect(selected.snapshotAsOf).toBe(archive.snapshotAsOf);
  expect(selected.proofHash).toBe(archive.proofHash);
  expect(selected.domainIndices.geopolitics?.readingStatus).toBe("last_verified");
  expect(JSON.stringify(archive)).toBe(before);
  const quiet=newestWebsiteRiskSnapshot([archive],AS_OF+365*24*HOUR)!;
  expect(quiet.snapshotAsOf).toBe(archive.snapshotAsOf);
  expect(quiet.proofHash).toBe(archive.proofHash);
  expect(quiet.domainIndices.macro?.readingStatus).toBe('last_verified');
 });
});
