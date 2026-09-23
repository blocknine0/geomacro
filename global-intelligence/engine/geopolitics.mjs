import {searchGdelt} from "../adapters/gdelt.mjs";
import {getJson} from "../adapters/http.mjs";

const WB_COUNTRY_URL = "https://api.worldbank.org/v2/country";

function normalizeIso3(value) {
  const v = String(value || "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(v) ? v : null;
}

async function iso2ForIso3(iso3) {
  const data = await getJson(`${WB_COUNTRY_URL}/${iso3}?format=json`);
  const row = Array.isArray(data?.[1]) ? data[1][0] : null;
  const iso2 = String(row?.iso2Code || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(iso2)) throw new Error(`Unable to resolve ISO2 for ${iso3}`);
  return iso2;
}

export async function fetchGeopolitics(question, {countryIso3 = null, countryIso2 = null} = {}) {
  const iso3 = normalizeIso3(countryIso3);
  if (!iso3 && !countryIso2) throw new Error("countryIso3 or countryIso2 is required for geopolitics.");

  const iso2 = String(countryIso2 || await iso2ForIso3(iso3)).toUpperCase();
  return searchGdelt(iso2, {queryExtra: String(question || "").trim()});
}

export async function createGeopoliticsAdapter() {
  return ({question, countryIso3}) => fetchGeopolitics(question, {countryIso3});
}
