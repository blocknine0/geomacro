import {describe,it,expect} from "vitest";
import {countriesInAnswerQuestion,normalizeAnswerQuestionRequest}
  from "../lib/geomacro-answer-request.server";
import {geomacroAgentToolToCanonicalQuery,geomacroAgentTool}
  from "../lib/geomacro-agent-tools";
import {buildAgentQueryPlan} from "../lib/agent-query-plan";
import {resolveGeomacroCapabilityPrice} from "../lib/capability-pricing-catalog";

function normalize(question:string,extra:Record<string,unknown>={}) {
  const result=normalizeAnswerQuestionRequest({question,...extra});
  if(!result.ok)throw new Error(result.code);
  return result.value as Record<string,any>;
}

describe("Geomacro Answer Question tool",()=>{
  it("maps one country and one topic to the locked focused query price",()=>{
    const query=normalize("What is the inflation risk in Brazil?");
    expect(query.subjects).toEqual([{type:"country",country_iso3:"BRA"}]);
    expect(query.topics).toEqual(["macro_risk"]);
    expect(query.product).toEqual({capability:"intelligence_query",variant:"focused"});
    expect(query.detail).toBe("compact");
    const plan=buildAgentQueryPlan(query);
    expect(resolveGeomacroCapabilityPrice("intelligence_query",plan.product!.variant).amount_usdc).toBe("0.02");
  });

  it("maps two topics for one country to standard and uses the exact 0.03 USDC catalog price",()=>{
    const query=normalize("Inflation and currency reserves in Brazil");
    expect(query.topics).toEqual(["fx_external_risk","macro_risk"]);
    expect(query.product.variant).toBe("standard");
    expect(resolveGeomacroCapabilityPrice("intelligence_query",query.product.variant).amount_usdc).toBe("0.03");
  });

  it("maps multiple countries to complex and uses the exact 0.05 USDC catalog price",()=>{
    const query=normalize("Compare inflation in Brazil and Argentina");
    expect(query.subjects).toEqual([
      {type:"country",country_iso3:"ARG"},
      {type:"country",country_iso3:"BRA"},
    ]);
    expect(query.product.variant).toBe("complex_multi_source");
    expect(query.detail).toBe("full");
    expect(buildAgentQueryPlan(query).intent).toBe("comparison");
    expect(resolveGeomacroCapabilityPrice("intelligence_query",query.product.variant).amount_usdc).toBe("0.05");
  });

  it("chooses the longest country name and does not resolve ambiguous names",()=>{
    expect(countriesInAnswerQuestion("Critical minerals in Papua New Guinea"))
      .toEqual({iso3s:["PNG"],ambiguous:false});
    expect(normalizeAnswerQuestionRequest({question:"Inflation risk in Georgia"}))
      .toMatchObject({ok:false,code:"AMBIGUOUS_SUBJECT"});
    expect(normalizeAnswerQuestionRequest({question:"Inflation risk in Turkey"}))
      .toMatchObject({ok:false,code:"AMBIGUOUS_SUBJECT"});
    const congo=normalizeAnswerQuestionRequest({question:"Inflation risk in Congo"});
    expect(congo.ok).toBe(false);
    if(!congo.ok) expect(["AMBIGUOUS_SUBJECT","SUBJECT_REQUIRED"]).toContain(congo.code);
  });

  it("fails closed for missing subject/topic, advanced products, extra fields and invalid limits",()=>{
    expect(normalizeAnswerQuestionRequest({question:"What is inflation?"}))
      .toMatchObject({ok:false,code:"SUBJECT_REQUIRED"});
    expect(normalizeAnswerQuestionRequest({question:"Tell me about Brazil"}))
      .toMatchObject({ok:false,code:"TOPIC_REQUIRED"});
    expect(normalizeAnswerQuestionRequest({question:"Risk Gate should I pay in Brazil"}))
      .toMatchObject({ok:false,code:"STRUCTURED_PRODUCT_REQUIRED"});
    expect(normalizeAnswerQuestionRequest({question:"Inflation risk in Brazil",price:"0.001"}))
      .toMatchObject({ok:false,code:"QUESTION_ONLY_FIELDS_UNSUPPORTED"});
    expect(normalizeAnswerQuestionRequest({question:"Inflation risk in Brazil",max_age_seconds:"forever"}))
      .toMatchObject({ok:false,code:"MAX_AGE_INVALID"});
    expect(normalizeAnswerQuestionRequest({question:"x".repeat(1001)}))
      .toMatchObject({ok:false,code:"QUESTION_INVALID_OR_TOO_LONG"});
  });

  it("leaves existing structured requests unchanged and exposes the MCP tool through the same canonical engine",()=>{
    const structured={subjects:[{type:"country",country_iso3:"IND"}],topics:["macro_risk"]};
    expect(normalizeAnswerQuestionRequest(structured)).toEqual({ok:true,value:structured,normalized:false});
    expect(geomacroAgentTool("answer_question")?.paid).toBe(true);
    const query=geomacroAgentToolToCanonicalQuery("answer_question",{
      question:"What is the inflation risk in Brazil?",
    });
    expect(query.product).toEqual({capability:"intelligence_query",variant:"focused"});
    expect(query.subjects).toEqual([{type:"country",country_iso3:"BRA"}]);
    expect(buildAgentQueryPlan(query).query_plan_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
