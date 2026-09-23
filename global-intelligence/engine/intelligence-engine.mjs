import {routeQuestion} from "./router.mjs";
import {verifyObservations} from "./cross-source-verifier.mjs";
import {defaultAdapters} from "./default-adapters.mjs";

function unwrapRows(result) {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.observations)) return result.observations;
  return [];
}

export async function answerQuestion(question, {countryIso3 = null, adapters = null, options = {}} = {}) {
  const activeAdapters = adapters ?? defaultAdapters(options);
  const categories = routeQuestion(question);
  const observations = [];
  const adapterResults = {};

  for (const category of categories) {
    const adapter = activeAdapters[category];
    if (!adapter) continue;

    const result = await adapter({question, countryIso3});
    const rows = unwrapRows(result);
    adapterResults[category] = {
      observation_count: rows.length,
      requested: result?.requested_indicators ?? null
    };
    observations.push(...rows);
  }

  const verified = verifyObservations(observations);

  return {
    schema_version: "intelligence-answer-1.0",
    question,
    country_iso3: countryIso3,
    categories,
    adapter_results: adapterResults,
    observation_count: observations.length,
    verified,
    generated_at: new Date().toISOString()
  };
}
