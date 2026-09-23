import {fetchWorldBank} from "../adapters/world-bank.mjs";

const INDICATORS = [
  ["gdp", "NY.GDP.MKTP.CD"],
  ["growth", "NY.GDP.MKTP.KD.ZG"],
  ["inflation", "FP.CPI.TOTL.ZG"],
  ["cpi", "FP.CPI.TOTL.ZG"],
  ["unemployment", "SL.UEM.TOTL.ZS"],
  ["employment", "SL.EMP.TOTL.SP.ZS"],
  ["trade", "NE.TRD.GNFS.ZS"],
  ["debt", "GC.DOD.TOTL.GD.ZS"],
  ["fiscal", "GC.BAL.CASH.GD.ZS"],
  ["current account", "BN.CAB.XOKA.GD.ZS"]
];

function indicatorsForQuestion(question) {
  const q = String(question || "").toLowerCase();
  const selected = INDICATORS.filter(([term]) => q.includes(term)).map(([,code]) => code);
  return [...new Set(selected.length ? selected : ["NY.GDP.MKTP.CD", "NY.GDP.MKTP.KD.ZG", "FP.CPI.TOTL.ZG"])];
}

export async function fetchMacro(question, {countryIso3 = null} = {}) {
  if (!countryIso3) throw new Error("countryIso3 is required for macro intelligence.");
  return fetchWorldBank(countryIso3, {indicators: indicatorsForQuestion(question), mrv: 5});
}

export async function createMacroAdapter() {
  return ({question, countryIso3}) => fetchMacro(question, {countryIso3});
}
