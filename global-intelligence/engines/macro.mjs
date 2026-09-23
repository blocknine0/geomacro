import {fetchWorldBank} from "../adapters/world-bank.mjs";
import {fetchEurostatDataset} from "../adapters/eurostat.mjs";
import catalog from "../sources/world-bank-indicator-catalog.v1.json" with {type:"json"};
import eurostatCatalog from "../sources/eurostat-dataset-catalog.v1.json" with {type:"json"};

function resolveIndicators({indicator, indicators, family, question=""}) {
  if (indicators) return indicators;
  if (indicator) return [indicator];
  const text=String(question).toLowerCase();
  const matchedFamily=family || Object.entries(catalog.aliases).find(([alias])=>text.includes(alias))?.[1] || null;
  return matchedFamily ? catalog.families[matchedFamily] : catalog.families.growth;
}

function resolveEurostatDataset({datasetCode, family, question=""}) {
  if (datasetCode) return datasetCode;
  const text=String(question).toLowerCase();
  const matched=family || Object.entries(eurostatCatalog.datasets)
    .find(([,item])=>item.aliases.some(alias=>text.includes(alias)));
  return eurostatCatalog.datasets[matched]?.code || eurostatCatalog.datasets.gdp.code;
}

export async function runMacro({
  countryIso3, indicator, indicators, family, question="", mrv=5,
  frequency=null, date=null, gapfill=false, source="world_bank",
  eurostatDataset=null, eurostatFilters={}, startPeriod=null, endPeriod=null
}) {
  if (!countryIso3) throw new Error("countryIso3 is required");
  const iso3=countryIso3.toUpperCase();

  if (source === "eurostat") {
    const result=await fetchEurostatDataset(
      resolveEurostatDataset({datasetCode:eurostatDataset,family,question}),
      {countryIso3:iso3,filters:eurostatFilters,startPeriod,endPeriod}
    );
    return {
      source:"eurostat",
      country_iso3:iso3,
      requested_dataset:result.dataset_code,
      observations:result.rows
    };
  }

  const resolvedIndicators=resolveIndicators({indicator,indicators,family,question});
  const rows=await fetchWorldBank(iso3,{indicators:resolvedIndicators,mrv,frequency,date,gapfill});
  return {
    source:"world_bank_indicators",
    country_iso3:iso3,
    requested_indicators:resolvedIndicators,
    observations:rows
  };
}
