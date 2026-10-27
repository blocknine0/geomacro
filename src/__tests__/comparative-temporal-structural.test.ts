import { describe, expect, it } from "vitest";
import { compareVerifiedCorridorEndpoints, compareVerifiedHistoricalBaseline,
  type VerifiedTimedMetric } from "../lib/comparative-temporal-structural";

const now: VerifiedTimedMetric = {
 country_iso3:"IND",dimension:"macro_monetary",metric:"inflation_yoy",unit:"percent",
 numeric_value:4.5,reference_period_start:"2025-01-01T00:00:00.000Z",
 reference_period_end:"2025-12-31T23:59:59.999Z",reference_period_granularity:"year",
 qualified_state:"VERIFIED",evidence_hash:"a".repeat(64),
};
const prev={...now,numeric_value:4.0,reference_period_start:"2024-01-01T00:00:00.000Z",
 reference_period_end:"2024-12-31T23:59:59.999Z",evidence_hash:"b".repeat(64)};
describe("verified time-aligned structural comparison",()=>{
 it("aligns directional endpoints and does not claim bilateral route",()=>{
   const dest={...now,country_iso3:"BGD",numeric_value:5,evidence_hash:"c".repeat(64)};
   const result=compareVerifiedCorridorEndpoints(now,dest,"IND","BGD");
   expect(result.destination_minus_origin).toBe(0.5);
   expect(result.subject).toMatchObject({origin_country_iso3:"IND",destination_country_iso3:"BGD"});
   expect(result.direct_bilateral_relationship_verified).toBe(false);
   expect(compareVerifiedCorridorEndpoints(dest,now,"BGD","IND").destination_minus_origin).toBe(-0.5);
 });
 it("rejects mismatched time, currency/unit, geography and unrelated metric",()=>{
   const dest={...now,country_iso3:"BGD",evidence_hash:"c".repeat(64)};
   expect(()=>compareVerifiedCorridorEndpoints(now,{...dest,reference_period_start:"2024-01-01T00:00:00.000Z"},"IND","BGD")).toThrow("NOT_ALIGNED");
   expect(()=>compareVerifiedCorridorEndpoints(now,{...dest,unit:"USD"},"IND","BGD")).toThrow("MISMATCH");
   expect(()=>compareVerifiedCorridorEndpoints(now,dest,"BGD","IND")).toThrow("SUBJECT_MISMATCH");
   expect(()=>compareVerifiedCorridorEndpoints(now,{...dest,metric:"gdp"},"IND","BGD")).toThrow("MISMATCH");
 });
 it("uses only strictly earlier verified baseline and does not infer live movement",()=>{
   const result=compareVerifiedHistoricalBaseline(now,prev);
   expect(result.delta).toBe(0.5);expect(result.percent_change).toBe(12.5);
   expect(result.direction).toBe("INCREASED");
   expect(result.inferred_real_time_movement).toBe(false);
   expect(()=>compareVerifiedHistoricalBaseline(prev,now)).toThrow("NOT_PREVIOUS");
   expect(()=>compareVerifiedHistoricalBaseline(now,now)).toThrow("NOT_PREVIOUS");
 });
 it("refuses zero-baseline percent division and accepts zero values",()=>{
   expect(compareVerifiedHistoricalBaseline(now,{...prev,numeric_value:0}).percent_change).toBeNull();
 });
 it("rejects unqualified, nonfinite, false country or hash",()=>{
   expect(()=>compareVerifiedHistoricalBaseline({...now,qualified_state:"UNKNOWN" as any},prev)).toThrow("UNQUALIFIED");
   expect(()=>compareVerifiedHistoricalBaseline({...now,numeric_value:NaN},prev)).toThrow("UNQUALIFIED");
   expect(()=>compareVerifiedHistoricalBaseline({...now,country_iso3:"ZZZ"},prev)).toThrow("UNQUALIFIED");
   expect(()=>compareVerifiedHistoricalBaseline({...now,evidence_hash:"bad"},prev)).toThrow("UNQUALIFIED");
 });
});
