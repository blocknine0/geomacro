import taxonomy from "../sources/country-mineral-taxonomy.v1.json" with {type:"json"};

const clean=v=>String(v??"").trim().replace(/\s+/g," ").toUpperCase();

export function normalizeCountryIso3(value,{canonicalIso3Set=null}={}){
  const c=clean(value);
  const candidate=/^[A-Z]{3}$/.test(c)?c:(taxonomy.country_aliases[c]??null);
  if(!candidate) return null;
  return canonicalIso3Set && !canonicalIso3Set.has(candidate) ? null : candidate;
}

export function normalizeMineral(value){
  const c=clean(value);
  return taxonomy.commodity_aliases[c] ?? null;
}

export function normalizeMineralObservation(row,{canonicalIso3Set=null}={}){
  const raw=row?.raw ?? row ?? {};
  const country=normalizeCountryIso3(raw.country_iso3 ?? raw.country ?? raw.Country,{canonicalIso3Set});
  const mineral=normalizeMineral(raw.mineral ?? raw.commodity ?? raw.Commodity);
  return {...row,normalized_country_iso3:country,normalized_mineral:mineral,
    normalization_status:country&&mineral?"RESOLVED":"UNRESOLVED"};
}

export function validateNormalizedCountries(rows,{canonicalIso3Set}={}){
  if(!(canonicalIso3Set instanceof Set)) throw new Error("canonicalIso3Set is required.");
  return rows.map(row=>normalizeMineralObservation(row,{canonicalIso3Set}));
}
