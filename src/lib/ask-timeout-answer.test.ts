import {describe,it,expect} from "vitest";
import {timedOutAskAnswer} from "./ask-geomacro-core.server";
describe("Ask timeout returns a complete, honest no-score response",()=>{
 const cases=[
  ["What is the latest geopolitical risk index?","Geopolitical Risk Index"],
  ["What is the latest macroeconomic risk index?","Macroeconomic Risk Index"],
  ["What is the latest critical minerals risk index?","Critical Minerals Risk Index"],
 ];
 for(const [question,label] of cases){
  it("preserves public response fields for "+label,()=>{
    const data=timedOutAskAnswer(question);
    expect(data.summary).toContain(label);
    for(const field of ["summary","what_changed","why_it_matters","geomacro_view"] as const)
      expect(data[field].trim().length).toBeGreaterThan(15);
    expect(data.insufficient_evidence).toBe(true);
    expect(data.low_confidence).toBe(true);
    expect(data.gri).toBeNull();
    expect(data.evidence).toEqual([]);
    expect(data.source_identity_exposed).toBe(false);
    expect(data.durable_live_storage_write).toBe(false);
  });
 }
 it("does not echo an arbitrary untrusted question in timeout summary",()=>{
  const x=timedOutAskAnswer("Tell me <script>secrets</script>");
  expect(x.summary).toContain("requested GeoMacro research");
  expect(x.summary).not.toContain("<script>");
 });
});