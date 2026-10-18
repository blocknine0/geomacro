import {getJson,observation} from "./http.mjs";

function normalizeIndicators(indicators) {
  if (!indicators) return ["NY.GDP.MKTP.CD"];
  if (Array.isArray(indicators)) return [...new Set(indicators.filter(Boolean))];
  return String(indicators).split(";").map(s=>s.trim()).filter(Boolean);
}

function normalizeRows(data) {
  if (!Array.isArray(data) || !Array.isArray(data[1])) return [];
  return data[1].filter(r=>r && r.value !== null && r.value !== undefined);
}

export async function fetchWorldBank(countryIso3, {
  indicators = ["NY.GDP.MKTP.CD"],
  mrv = 5,
  frequency = null,
  date = null,
  gapfill = false,
  source = null
} = {}) {
  // Statistical reference periods cannot become current original news clocks.
  const requestedIso3=String(countryIso3??"").toUpperCase();
  if(!/^[A-Z]{3}$/u.test(requestedIso3))throw Error("WORLD_BANK_ISO3_INVALID");

  const codes = normalizeIndicators(indicators);
  if (codes.length > 60) throw new Error("World Bank supports at most 60 indicators per request");

  const params = new URLSearchParams({
    format: "json",
    mrv: String(mrv)
  });
  if (frequency) params.set("frequency", frequency);
  if (date) params.set("date", date);
  if (gapfill) params.set("gapfill", "Y");
  if (source !== null && source !== undefined) params.set("source", String(source));

  const url = `https://api.worldbank.org/v2/country/${countryIso3.toLowerCase()}/indicator/${codes.join(";")}?${params.toString()}`;
  const data = await getJson(url);
  // Require identity to come from the official row, not from the request.
  const rows = normalizeRows(data).filter(r=>
    r.countryiso3code===requestedIso3 &&
    codes.includes(r.indicator?.id) &&
    typeof r.value==="number" && Number.isFinite(r.value) &&
    typeof r.date==="string" && /^(?:19|20)\d{2}(?:[QM]\d{1,2})?$/u.test(r.date)
  );

  return rows.map(r => observation({
    sourceId: "world_bank_indicators",
    category: "MACRO",
    countryIso3: requestedIso3,
    // Dataset reference period is not an individual original publication.
    publishedAt: null,
    title: `${r.indicator?.value || r.indicator?.id || "World Bank indicator"} ${r.date}`,
    summary: JSON.stringify({
      indicator: r.indicator?.id || null,
      indicator_name: r.indicator?.value || null,
      value: r.value,
      unit: r.unit || null,
      period: r.date,
      native_original_publication_proven: false,
      historical_reference_only: true,
      observation_status: r.obs_status || null,
      source_last_updated: data?.[0]?.lastupdated || null
    }),
    url
  }));
}

export async function fetchWorldBankIndicatorCatalog({page = 1, perPage = 1000} = {}) {
  const url = `https://api.worldbank.org/v2/indicator?format=json&page=${page}&per_page=${perPage}`;
  const data = await getJson(url);
  const rows = normalizeRows(data);
  return {
    page: data?.[0]?.page ?? page,
    pages: data?.[0]?.pages ?? null,
    total: data?.[0]?.total ?? rows.length,
    last_updated: data?.[0]?.lastupdated ?? null,
    indicators: rows
  };
}
