import type {GlobalRisk,RiskDomainReading,Timeframe} from "../../lib/global-risk.types";
export const HOUR=3600_000;
export const AS_OF=Date.parse('2026-10-08T06:38:59.944Z');
const HEX='a'.repeat(64);
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

export function fixture(): GlobalRisk {
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


export function shiftedFixture(hours:number):GlobalRisk {
 const value=fixture();
 const shift=(entry:unknown,key=""):unknown=>{
  if(Array.isArray(entry))return entry.map(v=>shift(v));
  if(entry&&typeof entry==="object")return Object.fromEntries(Object.entries(entry).map(([k,v])=>[k,shift(v,k)]));
  if(typeof entry==="number"&&key==="t")return entry+hours*HOUR;
  if(typeof entry==="string"&&(key==="snapshotAsOf"||key==="readingAsOf"))return new Date(Date.parse(entry)+hours*HOUR).toISOString();
  return entry;
 };
 return shift(value) as GlobalRisk;
}
