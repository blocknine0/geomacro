import {fetchGeopolitics} from "./geopolitics.mjs";
import {fetchMacro} from "./macro.mjs";
import {fetchMinerals} from "./minerals.mjs";

export function defaultAdapters(options = {}) {
  return {
    GEOPOLITICS: ({question, countryIso3}) => fetchGeopolitics(question, {countryIso3}),
    MACRO: ({question, countryIso3}) => fetchMacro(question, {countryIso3}),
    CRITICAL_MINERALS: ({question, countryIso3}) =>
      fetchMinerals(question, {countryIso3, trade: options.minerals?.trade || null})
  };
}
