import {describe,expect,it} from "vitest";
import {domainGuideAnswer} from "./ask-domain-guide";
describe("three-domain editorial explanations and scope",()=>{
 it.each(["What is inflation?","Explain geopolitical risk","What are rare earths?","How do interest rates affect currencies?","Explain sovereign debt","What is GDP?","Explain tariffs"])("explains %s without claiming live evidence",q=>{
  const a=domainGuideAnswer(q)!;
  expect(a.answer_kind).toBe("explainer");expect(a.summary.length).toBeGreaterThan(50);
  expect(a.evidence).toEqual([]);expect(a.gri).toBeNull();
 });
 it.each(["What is the latest inflation rate in India?","Latest rare earth news","What happened in geopolitics today?","What is the current gold price?","Predict inflation next year"])("keeps %s on the retrieval path",q=>expect(domainGuideAnswer(q)).toBeNull());
 it.each(["Write a poem about inflation","Latest football news","Latest cricket news in India","Bake a cake","What is JavaScript?"])("keeps unrelated request %s out of retrieval",q=>{
  expect(domainGuideAnswer(q)?.answer_kind).toBe("guidance");
 });
 it.each(["hello","help","What changed today?"])("handles entry request %s",q=>{
  if(q==="What changed today?")expect(domainGuideAnswer(q)).toBeNull();
  else expect(domainGuideAnswer(q)?.summary).toContain("Geomacro");
 });
});
