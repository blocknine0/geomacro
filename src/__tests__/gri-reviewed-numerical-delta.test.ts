import {describe,expect,it} from "vitest";
import {reviewedNumericalGriDelta} from "../../scripts/lib/gri-reviewed-numerical-delta.mjs";
const one={id:"11111111-1111-4111-8111-111111111111",
  as_of:"2026-10-18T10:00:00.000Z",
  methodology_version:"gri-v1.2.0",status:"published",verification_status:"verified",
  proof_hash:"a".repeat(64),calculation_hash:"b".repeat(64),
  raw_score:40.125,display_score:40};
const current={methodologyVersion:"gri-v1.2.0",asOf:"2026-10-18T11:00:00.000Z",
  rawScore:55.75,displayScore:56,coverage:1,categories:[{category:"macro"}]};
const history=[one,{...one,id:"22222222-2222-4222-8222-222222222222",as_of:"2026-10-18T09:00:00.000Z"}];
describe("v1.2 reviewed current GRI historical numerical delta",()=>{
  it("computes real signed-current raw-score minus prior verified historical raw-score",()=>{
    const m=reviewedNumericalGriDelta(current,history);
    expect(m.previous_raw_score).toBe(40.125);
    expect(m.previous_display_score).toBe(40);
    expect(m.previous_as_of).toBe(one.as_of);
    expect(m.change_points).toBeCloseTo(15.625,12);
    expect(m.change_hash).toBeNull();
    expect(m.change_attribution).toBeNull();
    expect(m.numerical_change_not_event_attribution).toBe(true);
  });
  it("allows a real reviewed decrease, but never invents independent event attribution",()=>{
    const m=reviewedNumericalGriDelta({...current,rawScore:23.25,displayScore:23},history);
    expect(m.change_points).toBeCloseTo(-16.875);
    expect(m.change_attribution).toBeNull();
  });
  it("rejects unverified, stale-lookahead or mismatched methodology history",()=>{
    for(const x of [
      {verification_status:"unverified"},
      {status:"private_only"},
      {methodology_version:"gri-v1.1.0"},
      {proof_hash:"not-a-proof"},
      {calculation_hash:"not-a-proof"},
      {raw_score:101},
      {raw_score:null},
      {display_score:null},
      {as_of:"2026-10-18T12:00:00.000Z"},
    ])expect(()=>reviewedNumericalGriDelta(current,[{...one,...x},history[1]])).toThrow(/GRI_REVIEWED_NUMERICAL_DELTA_/);
    expect(()=>reviewedNumericalGriDelta(current,[one])).toThrow(/GRI_REVIEWED_NUMERICAL_DELTA_/);
  });
  it("rejects fabricated current scores, missing three-domain coverage, future backdating",()=>{
    for(const x of [{rawScore:null},{rawScore:101},{displayScore:null},
      {coverage:1/3},{asOf:"2026-10-18T09:00:00.000Z"},
      {methodologyVersion:"not-v1.2"},{categories:null}])
      expect(()=>reviewedNumericalGriDelta({...current,...x},history)).toThrow(/GRI_REVIEWED_NUMERICAL_DELTA_/);
  });
});
