import {describe,it,expect} from 'vitest';
import {websiteHistoricalRiskView} from '../lib/website-historical-risk-view';
import {validateGlobalRiskContinuity} from '../lib/global-risk-continuity';
import type {GlobalRisk,RiskDomainReading,Timeframe} from '../lib/global-risk.types';
const HOUR=3600_000,AS_OF=Date.parse('2026-10-08T06:38:59.944Z'),HEX='a'.repeat(64);
function buckets(hours: number[], anchor = AS_OF) {
  return hours.map((ago, index) => ({
    t: anchor - ago * HOUR,
    avg: 40 + index,
    count: 12 + index,
  }));
}

function series(timeframe: Timeframe, values: ReturnType<typeof buckets>) {
  const sorted = [...values].sort((a, b) => a.t - b.t);
  const scores = sorted.map((value) => value.avg);
  return {
    timeframe,
    buckets: sorted,
    low: Math.min(...scores),
    high: Math.max(...scores),
  };
}

function domainReading(
  rawScore: number,
  previousScore: number,
  h24: ReturnType<typeof buckets>,
  d7: ReturnType<typeof buckets>,
  d30: ReturnType<typeof buckets>,
  readingAsOf = new Date(AS_OF).toISOString(),
  readingStatus: "current" | "last_verified" = "current",
): RiskDomainReading {
  return {
    score: Math.round(rawScore),
    rawScore,
    previousScore,
    changePoints: rawScore - previousScore,
    confidence: 82,
    eventCount: 7,
    sourceCount: 5,
    independentStoryCount: 6,
    readingSnapshotId: "22222222-2222-4222-8222-222222222222",
    readingAsOf,
    readingStatus,
    series: {
      "24H": series("24H", h24),
      "7D": series("7D", d7),
      "30D": series("30D", d30),
    },
  };
}

function fixture(): GlobalRisk {
  const h24 = buckets([20, 8, 0]);
  const d7 = buckets([6 * 24, 5 * 24, 4 * 24, 3 * 24, 2 * 24, 24, 0]);
  const d30 = buckets([28 * 24, 21 * 24, 14 * 24, 7 * 24, 5 * 24, 3 * 24, 24, 0]);
  return {
    snapshotId: "11111111-1111-4111-8111-111111111111",
    score: 47,
    rawScore: 46.75,
    previous: 46,
    previousRaw: 45.8,
    low: 40,
    high: 47,
    eventCount: 19,
    eventCountPrevious: null,
    sourceCount: 9,
    independentStoryCount: 11,
    storyCorrelationVersion: "gri-story-correlation-v1.0.0",
    storyCorrelationPromptVersion: "gri-story-correlation-prompt-v1.0.0",
    coverage: 1,
    weightedConfidence: 82,
    methodologyVersion: "gri-v1.2.0",
    auditPersisted: true,
    proofVersion: "gri-proof-v1.2.0",
    verificationStatus: "verified",
    proofHash: HEX,
    evidenceHash: HEX,
    calculationHash: HEX,
    dispositionHash: HEX,
    candidateEventCount: 21,
    inputHash: HEX,
    methodologyHash: HEX,
    changeHash: HEX,
    reconciliationResidual: 0,
    changeResidual: 0,
    snapshotAsOf: new Date(AS_OF).toISOString(),
    usedFallbackWindow: false,
    series: {
      "24H": series("24H", h24),
      "7D": series("7D", d7),
      "30D": series("30D", d30),
    },
    domainIndices: {
      geopolitics: domainReading(51, 49, h24, d7, d30),
      macro: domainReading(44, 45, h24, d7, d30),
      rare_earth: domainReading(46, 44, h24, d7, d30),
    },
    drivers: [],
    topDriver: null,
    recentEvents: [],
  };
}

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
 it('cannot rescue a bad proof/history, under-embargo, future, or beyond-retention snapshot',()=>{
  const now=AS_OF+8*86400_000;
  for(const mutate of [(x:GlobalRisk)=>{x.proofHash='invalid'},
    (x:GlobalRisk)=>{x.domainIndices.macro!.series['7D'].buckets=[]},
    (x:GlobalRisk)=>{x.domainIndices.macro!.readingStatus='invalid' as any}]){
   const x=fixture();mutate(x);expect(websiteHistoricalRiskView(x,now)).toBeNull();
  }
  expect(websiteHistoricalRiskView(fixture(),AS_OF+59*60_000)).toBeNull();
  expect(websiteHistoricalRiskView(fixture(),AS_OF-1)).toBeNull();
  expect(websiteHistoricalRiskView(fixture(),AS_OF+31*86400_000)).toBeNull();
 });
});
