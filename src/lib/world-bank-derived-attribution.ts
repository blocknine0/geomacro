/**
 * Narrow CC BY 4.0 attribution metadata for Geomacro-derived WDI analysis.
 * These are references to publicly published dataset and licence notices,
 * NOT raw API URLs, payloads, source IDs or private evidence. No other
 * third-party URL/provider gets through the paid output boundary.
 */
export type WorldBankWdiIndicator = "FP.CPI.TOTL.ZG" | "NY.GDP.MKTP.KD.ZG";
export type WorldBankWdiAttribution = {
  schema: "geomacro.approved-derived-data-attribution.v1";
  credit: "World Bank, World Development Indicators";
  terms: "CC BY 4.0";
  terms_uri: "https://creativecommons.org/licenses/by/4.0/";
  material_uris: string[];
  modifications: "Geomacro adapted annual indicator observations into derived analysis; World Bank does not endorse the analysis.";
};

const INDICATOR_URI:Record<WorldBankWdiIndicator,string> = {
  "FP.CPI.TOTL.ZG": "https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG",
  "NY.GDP.MKTP.KD.ZG": "https://data.worldbank.org/indicator/NY.GDP.MKTP.KD.ZG",
};
const FIXED = {
  schema: "geomacro.approved-derived-data-attribution.v1",
  credit: "World Bank, World Development Indicators",
  terms: "CC BY 4.0",
  terms_uri: "https://creativecommons.org/licenses/by/4.0/",
  modifications: "Geomacro adapted annual indicator observations into derived analysis; World Bank does not endorse the analysis.",
} as const;

export function approvedWdiAttribution(
  indicators: readonly WorldBankWdiIndicator[],
): WorldBankWdiAttribution {
  const unique = [...new Set(indicators)].sort();
  if(unique.length<1||unique.length>2||
     unique.some(key=>!Object.prototype.hasOwnProperty.call(INDICATOR_URI,key)))
    throw Error("WDI_ATTRIBUTION_INDICATORS_INVALID");
  return {...FIXED,material_uris:unique.map(key=>INDICATOR_URI[key])};
}

export function isApprovedWdiAttribution(value:unknown):value is WorldBankWdiAttribution {
  if(!value||typeof value!=="object"||Array.isArray(value))return false;
  const x=value as Record<string,unknown>;
  const required=["schema","credit","terms","terms_uri","material_uris","modifications"].sort();
  if(Object.keys(x).sort().join("|")!==required.join("|"))return false;
  for(const [key,expected] of Object.entries(FIXED))
    if(x[key]!==expected)return false;
  const uris=x.material_uris;
  if(!Array.isArray(uris)||uris.length<1||
     uris.length>2)return false;
  const expected=Object.values(INDICATOR_URI);
  if(!uris.every((uri:unknown)=>typeof uri==="string"&&expected.includes(uri)))return false;
  return new Set(uris).size===uris.length &&
    uris.every((uri:string,index:number)=>
      index===0 || uris[index-1]<uri);
}
