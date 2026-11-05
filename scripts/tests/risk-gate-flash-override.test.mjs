import test from "node:test";
import assert from "node:assert/strict";
import {readIntradayFlashOverride,applyIntradayFlashDecision} from "../../workers/control-plane/src/risk-gate-flash-override.mjs";

function db(row){return {prepare(){return {bind(){return {first:async()=>row}}}}}}
const baseline="2026-11-05T06:00:00.000Z";
const gro={object_id:"gro-x",generated_at:"2026-11-05T06:20:00.000Z",
 risk:{score:82},confidence:0.94};

test("only a newer signed high-severity high-confidence GRO triggers flash override",async()=>{
 const flash=await readIntradayFlashOverride(db({generated_at:baseline}),gro,{type:"country",id:"CHN"},Date.parse("2026-11-05T06:30:00Z"));
 assert.equal(flash.active,true);
 const result={decision:"CONTINUE",reason_codes:[]};
 applyIntradayFlashDecision(result,flash);
 assert.equal(result.decision,"REQUIRE_APPROVAL");
 assert.equal(result.intraday_override,true);
 assert.ok(result.reason_codes.includes("intraday_material_flash_override"));
});

test("daily baseline, low score or low confidence do not trigger",async()=>{
 assert.equal((await readIntradayFlashOverride(db({generated_at:"2026-11-05T06:25:00Z"}),gro,{type:"country",id:"CHN"},Date.parse("2026-11-05T06:30:00Z"))).active,false);
 assert.equal((await readIntradayFlashOverride(db({generated_at:baseline}),{...gro,risk:{score:79.9}},{type:"country",id:"CHN"},Date.parse("2026-11-05T06:30:00Z"))).active,false);
 assert.equal((await readIntradayFlashOverride(db({generated_at:baseline}),{...gro,confidence:0.89},{type:"country",id:"CHN"},Date.parse("2026-11-05T06:30:00Z"))).active,false);
});

test("flash integrity check outage holds CONTINUE",async()=>{
 const flash=await readIntradayFlashOverride({prepare(){throw Error("down")}},gro,{type:"country",id:"CHN"},Date.parse("2026-11-05T06:30:00Z"));
 const result={decision:"CONTINUE",reason_codes:[]};
 applyIntradayFlashDecision(result,flash);
 assert.equal(result.decision,"REQUIRE_APPROVAL");
 assert.equal(result.flash_check_available,false);
});
