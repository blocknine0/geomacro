import {fetchWorldBank} from "../adapters/world-bank.mjs";
import catalog from "../sources/world-bank-indicator-catalog.v1.json" with {type:"json"};

function resolveIndicators({indicator, indicators, family, question = ""}) {
  if (indicators) return indicators;
  if (indicator) return [indicator];

  const text = String(question).toLowerCase();
  const matchedFamily =
    family ||
    Object.entries(catalog.aliases).find(([alias]) => text.includes(alias))?.[1] ||
    null;

  return matchedFamily
    ? catalog.families[matchedFamily]
    : catalog.families.growth;
}

export async function runMacro({
  countryIso3,
  indicator,
  indicators,
  family,
  question = "",
  mrv = 5,
  frequency = null,
  date = null,
  gapfill = false
}) {
  if (!countryIso3) throw new Error("countryIso3 is required");

  const resolvedIndicators = resolveIndicators({
    indicator,
    indicators,
    family,
    question
  });

  const rows = await fetchWorldBank(countryIso3, {
    indicators: resolvedIndicators,
    mrv,
    frequency,
    date,
    gapfill
  });

  return {
    source: "world_bank_indicators",
    country_iso3: countryIso3.toUpperCase(),
    requested_indicators: resolvedIndicators,
    observations: rows
  };
}
