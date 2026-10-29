import {describe,expect,it} from "vitest";
import {COUNTRIES_195} from "./canonical-country-registry-195";
import {interpretMultilingualIntelligenceQuery} from "./multilingual-query-intent";

const categories={
  geopolitics:[
    {id:"sanctions",topic:"sanctions_restrictions",text:"What are the latest sanctions or export restrictions affecting"},
    {id:"conflict",topic:"conflict_geopolitics",text:"What verified armed-conflict or security developments affect"},
    {id:"governance",topic:"political_governance",text:"What has changed in elections or political governance in"},
    {id:"tariff",topic:"trade_corridor",text:"How do new tariffs and trade policy affect"},
  ],
  macro:[
    {id:"inflation",topic:"macro_risk",text:"What is the latest official inflation and monetary-policy release for"},
    {id:"foreign_exchange",topic:"fx_external_risk",text:"What are the foreign exchange and reserves developments for"},
    {id:"sovereign_debt",topic:"sovereign_risk",text:"What official sovereign debt and fiscal deficit evidence exists for"},
    {id:"banking",topic:"banking_financial_system",text:"What are the latest bank liquidity and financial-system signals for"},
  ],
  critical_minerals:[
    {id:"lithium",topic:"critical_minerals",text:"What new lithium mining or production developments have been published for"},
    {id:"copper",topic:"critical_minerals",text:"What official copper production and export changes are evidenced for"},
    {id:"rare_earth",topic:"critical_minerals",text:"What rare earth refining or processing disruptions are verified in"},
    {id:"graphite",topic:"critical_minerals",text:"What graphite supply and export restrictions are documented for"},
  ],
} as const;

type Category=keyof typeof categories;
const translated:Record<Category,{bn:string;hi:string}>={
  geopolitics:{bn:"সর্বশেষ নিষেধাজ্ঞা ও ভূরাজনৈতিক ঘটনা কী?",hi:"नवीनतम प्रतिबंध और भू-राजनीतिक घटनाएं क्या हैं?"},
  macro:{bn:"সর্বশেষ মুদ্রাস্ফীতি ও সুদের হার কী?",hi:"नवीनतम मुद्रास्फीति और ब्याज दरें क्या हैं?"},
  critical_minerals:{bn:"লিথিয়াম ও গুরুত্বপূর্ণ খনিজের সাম্প্রতিক পরিস্থিতি কী?",hi:"लिथियम और महत्वपूर्ण खनिजों की ताज़ा स्थिति क्या है?"},
};

describe("195-country × 3-category structured query routing",()=>{
  it("interprets all 4,680 generated human/machine questions without losing country or requested topic",()=>{
    let count=0;
    for(const [countryIndex,country] of COUNTRIES_195.entries()){
      for(const [category,archetypes] of Object.entries(categories) as [Category,typeof categories[Category]][]){
        const liveScenario=archetypes[countryIndex%archetypes.length].id;
        for(const selected of archetypes){
          for(const actor of ["human","machine"] as const){
            const multilingual=selected.id===archetypes[0].id&&actor==="human";
            const language=multilingual&&countryIndex%19===5?"bn":
              multilingual&&countryIndex%19===8?"hi":"en";
            const isTranslated=language!=="en";
            const text=isTranslated?translated[category][language as "bn"|"hi"]:
              `${selected.text} ${country.name}? Return dated evidence, uncertainty, and what to monitor, without guessing.`;
            const body={question:text,client_request_id:`G195-${String(++count).padStart(5,"0")}`,
              ...(actor==="machine"||isTranslated?{
                subjects:[{type:"country" as const,country_iso3:country.iso3}],
                topics:[selected.topic],
              }:{}),
              ...(isTranslated?{language}:{})};
            let result;
            try {
              result=interpretMultilingualIntelligenceQuery(body);
            } catch(error) {
              throw new Error(`routing failed: ${JSON.stringify({country:country.iso3,category,scenario:selected.id,actor,language,text,topics:body.topics})}; ${(error as Error).message}`);
            }
            expect(result.subjects,{country:country.iso3,category,scenario:selected.id,actor}).toEqual([
              {type:"country",country_iso3:country.iso3},
            ]);
            expect(result.topics,{country:country.iso3,category,scenario:selected.id,actor}).toContain(selected.topic);
            expect(result.canonical_request.fulfillment_mode).toBe("published_only");
            expect(result.payment_required_now).toBe(false);
            if(selected.id===liveScenario)expect(result.query_plan_hash).toMatch(/^[a-f0-9]{64}$/u);
          }
        }
      }
    }
    expect(count).toBe(4_680);
  });
});
