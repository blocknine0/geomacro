import taxonomy from "../sources/country-mineral-taxonomy.v1.json" with {type:"json"};

const clean=v=>String(v??"").trim().replace(/\s+/g," ").toUpperCase();
export function normalizeCountryIso3(value){
  const c=clean(value);
  if(/^[A-Z]{3}$/.test(c)) return c;
  return taxonomy.country_aliases[c] ?? null;
}
export function normalizeMineral(value){
  const c=clean(value);
  return taxonomy.commodity_aliases[c] ?? null;
}
export function normalizeMineralObservation(row){
  const raw=row?.raw ?? row ?? {};
  const country=normalizeCountryIso3(raw.country_iso3 ?? raw.country ?? raw.Country);
  const mineral=normalizeMineral(raw.mineral ?? raw.commodity ?? raw.Commodity);
  return {
    ...row,
    normalized_country_iso3:country,
    normalized_mineral:mineral,
    normalization_status:country && mineral ? "RESOLVED" : "UNRESOLVED"
  };
}
