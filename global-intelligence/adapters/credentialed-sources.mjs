import {getJson, observation} from "./http.mjs";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required credential: ${name}`);
  return value;
}

export async function probeCredentialedSource(sourceId) {
  const configs = {
    bls: {
      category: "MACRO", countryIso3: "USA", env: "BLS_API_KEY",
      build: key => `https://api.bls.gov/publicAPI/v2/timeseries/data/LNS14000000?startyear=2025&endyear=2026&registrationkey=${encodeURIComponent(key)}`,
      validate: x => Array.isArray(x?.Results?.series) && x.Results.series.some(s => Array.isArray(s?.data) && s.data.length > 0)
    },
    bea: {
      category: "MACRO", countryIso3: "USA", env: "BEA_API_KEY",
      build: key => `https://apps.bea.gov/api/data?UserID=${encodeURIComponent(key)}&method=GETDATASETLIST`,
      validate: x => Array.isArray(x?.BEAAPI?.Results?.Dataset)
    },
    alpha_vantage: {
      category: "MACRO", countryIso3: "USA", env: "ALPHA_VANTAGE_API_KEY",
      build: key => `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=IBM&outputsize=compact&apikey=${encodeURIComponent(key)}`,
      validate: x => Boolean(x?.["Time Series (Daily)"] && Object.keys(x["Time Series (Daily)"]).length > 0)
    },
    eia_api_v2: {
      category: "CRITICAL_MINERALS", countryIso3: "USA", env: "EIA_API_KEY",
      build: key => `https://api.eia.gov/v2/electricity/retail-sales/data/?api_key=${encodeURIComponent(key)}&frequency=monthly&data[]=price&facets[stateid][]=CO&length=1`,
      validate: x => Array.isArray(x?.response?.data) && x.response.data.length > 0
    },
    noaa_ncei: {
      category: "GEOPOLITICS", countryIso3: "USA", env: "NOAA_NCEI_TOKEN",
      build: () => "https://www.ncei.noaa.gov/cdo-web/api/v2/datasets?limit=1",
      headers: key => ({token:key}),
      validate: x => Array.isArray(x?.results) && x.results.length > 0
    },
    wto_timeseries: {
      category: "MACRO", countryIso3: null, env: "WTO_API_KEY",
      build: key => `https://api.wto.org/timeseries/v1/data?i=ITS_MTV_AX&r=000&ps=2024&subscription-key=${encodeURIComponent(key)}`,
      validate: x => Array.isArray(x?.Dataset) || Array.isArray(x?.data) || Array.isArray(x?.dataset)
    },
    opensanctions: {
      category: "GEOPOLITICS", countryIso3: null, env: "OPENSANCTIONS_API_KEY",
      build: () => "https://api.opensanctions.org/search/default?q=United%20States",
      headers: key => ({Authorization:`ApiKey ${key}`}),
      validate: x => Array.isArray(x?.results) || Array.isArray(x?.responses)
    }
  };

  const config = configs[sourceId];
  if (!config) throw new Error(`Unsupported credentialed source: ${sourceId}`);
  const key = required(config.env);
  const url = config.build(key);
  const raw = await getJson(url, {headers: config.headers?.(key) || {}});
  if (!config.validate(raw)) throw new Error(`Unexpected response shape for ${sourceId}`);

  return {
    source_id: sourceId,
    category: config.category,
    country_iso3: config.countryIso3,
    title: `${sourceId} runtime observation`,
    summary: "Credentialed source returned a valid bounded machine-readable response.",
    observed_at: new Date().toISOString(),
    confidence: 0.85,
    raw
  };
}

export async function fetchCredentialedObservation(sourceId) {
  return observation(await probeCredentialedSource(sourceId));
}
