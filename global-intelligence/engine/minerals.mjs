import {fetchUsGSMcs2026} from "../adapters/usgs-mcs-2026.mjs";
import {fetchComtradeTradeFlows} from "../adapters/un-comtrade.mjs";
import {normalizeMineralObservation} from "../adapters/mineral-normalization.mjs";

const MINERALS = [
  "lithium","cobalt","nickel","graphite","rare earth","rare-earth","copper","uranium",
  "manganese","tungsten","antimony","gallium","germanium","niobium","tantalum","vanadium",
  "chromium","zinc","tin","titanium","platinum","palladium","rhodium","iridium","ruthenium",
  "beryllium","bismuth","boron","cesium","fluorspar","helium","magnesium","molybdenum",
  "potash","phosphate","silicon","silver","tellurium"
];

function requestedMineral(question) {
  const q = String(question || "").toLowerCase();
  return MINERALS.find(term => q.includes(term)) || null;
}

function filterRows(rows, mineral, countryIso3) {
  return rows.filter(row => {
    const normalized = normalizeMineralObservation(row, {canonicalIso3Set: null});
    const commodity = String(normalized.mineral || "").toLowerCase();
    const country = String(normalized.country_iso3 || "").toUpperCase();
    const mineralMatch = !mineral || commodity.includes(mineral.replace("rare earth", "rare").replace("rare-earth", "rare"));
    const countryMatch = !countryIso3 || country === String(countryIso3).toUpperCase();
    return mineralMatch && countryMatch;
  });
}

export async function fetchMinerals(question, {countryIso3 = null, trade = null} = {}) {
  const mineral = requestedMineral(question);
  const rows = await fetchUsGSMcs2026();
  const production = filterRows(rows, mineral, countryIso3);

  // Do not infer a mineral trade series from TOTAL or from an unapproved HS mapping.
  // Callers must provide an explicitly reviewed UN Comtrade cmdCode.
  let tradeRows = [];
  if (trade?.cmdCode && countryIso3) {
    const result = await fetchComtradeTradeFlows(countryIso3, {
      period: trade.period || "2025",
      cmdCode: trade.cmdCode,
      partnerCode: trade.partnerCode || "0",
      allowPreview: trade.allowPreview !== false,
      category: "CRITICAL_MINERALS"
    });
    tradeRows = [...result.observations, result.trade_balance];
  }

  return [...production, ...tradeRows];
}

export async function createMineralsAdapter(options = {}) {
  return ({question, countryIso3}) => fetchMinerals(question, {countryIso3, trade: options.trade || null});
}
