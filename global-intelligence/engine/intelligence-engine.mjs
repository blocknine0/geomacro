import {routeQuestion} from "./router.mjs";
import {verifyObservations} from "./cross-source-verifier.mjs";
export async function answerQuestion(question,{countryIso3=null,adapters={}}={}){
  const categories=routeQuestion(question);
  const observations=[];
  for(const category of categories){
    const adapter=adapters[category];
    if(!adapter) continue;
    const rows=await adapter({question,countryIso3});
    observations.push(...(rows||[]));
  }
  const verified=verifyObservations(observations);
  return {schema_version:"intelligence-answer-1.0",question,country_iso3:countryIso3,categories,verified,generated_at:new Date().toISOString()};
}
