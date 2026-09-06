import type {
  GlobalEntityScope,
} from "./global-publication-coverage";


export const GLOBAL_ENTITY_CLASSIFICATION_VERSION =
  "global-entity-classification-v0.1.0" as const;


/*
 * Explicit sovereign set.
 *
 * This is intentionally deterministic and
 * independent of whether a third-party source
 * happens to publish data for the entity.
 *
 * Taiwan is treated as SPECIAL_ENTITY here
 * rather than silently forced into either the
 * sovereign or territory denominator.
 */
const SOVEREIGN_ISO3 = new Set([
  "AFG","ALB","DZA","AND","AGO","ATG","ARG","ARM","AUS","AUT",
  "AZE","BHS","BHR","BGD","BRB","BLR","BEL","BLZ","BEN","BTN",
  "BOL","BIH","BWA","BRA","BRN","BGR","BFA","BDI","CPV","KHM",
  "CMR","CAN","CAF","TCD","CHL","CHN","COL","COM","COG","COD",
  "CRI","CIV","HRV","CUB","CYP","CZE","DNK","DJI","DMA","DOM",
  "ECU","EGY","SLV","GNQ","ERI","EST","SWZ","ETH","FJI","FIN",
  "FRA","GAB","GMB","GEO","DEU","GHA","GRC","GRD","GTM","GIN",
  "GNB","GUY","HTI","HND","HUN","ISL","IND","IDN","IRN","IRQ",
  "IRL","ISR","ITA","JAM","JPN","JOR","KAZ","KEN","KIR","PRK",
  "KOR","KWT","KGZ","LAO","LVA","LBN","LSO","LBR","LBY","LIE",
  "LTU","LUX","MDG","MWI","MYS","MDV","MLI","MLT","MHL","MRT",
  "MUS","MEX","FSM","MDA","MCO","MNG","MNE","MAR","MOZ","MMR",
  "NAM","NRU","NPL","NLD","NZL","NIC","NER","NGA","MKD","NOR",
  "OMN","PAK","PLW","PAN","PNG","PRY","PER","PHL","POL","PRT",
  "QAT","ROU","RUS","RWA","KNA","LCA","VCT","WSM","SMR","STP",
  "SAU","SEN","SRB","SYC","SLE","SGP","SVK","SVN","SLB","SOM",
  "ZAF","SSD","ESP","LKA","SDN","SUR","SWE","CHE","SYR","TJK",
  "TZA","THA","TLS","TGO","TON","TTO","TUN","TUR","TKM","TUV",
  "UGA","UKR","ARE","GBR","USA","URY","UZB","VUT","VAT","VEN",
  "VNM","YEM","ZMB","ZWE",
]);


const TERRITORY_ISO3 = new Set([
  "ABW","AIA","ALA","ASM","ATA","ATF","BES","BLM","BMU","BVT",
  "CCK","COK","CUW","CXR","CYM","ESH","FLK","FRO","GIB","GLP",
  "GRL","GUF","GUM","GGY","HKG","HMD","IMN","IOT","JEY","MAC","MAF",
  "MNP","MSR","MTQ","MYT","NCL","NFK","NIU","PCN","PRI","PYF",
  "REU","SGS","SHN","SJM","SPM","SXM","TCA","TKL","UMI","VGB",
  "VIR","WLF",
]);


const SPECIAL_ENTITY_ISO3 = new Set([
  "PSE",
  "TWN",
  "UNK",
]);


function normalizeIso3(
  value: string,
): string {
  const iso3 =
    value
      .trim()
      .toUpperCase();

  if (!/^[A-Z]{3}$/.test(iso3)) {
    throw new Error(
      "country_iso3 must be ISO3",
    );
  }

  return iso3;
}


export function classifyGlobalEntity(
  countryIso3: string,
): GlobalEntityScope {
  const iso3 =
    normalizeIso3(
      countryIso3,
    );

  if (SOVEREIGN_ISO3.has(iso3)) {
    return "SOVEREIGN";
  }

  if (TERRITORY_ISO3.has(iso3)) {
    return "TERRITORY";
  }

  if (SPECIAL_ENTITY_ISO3.has(iso3)) {
    return "SPECIAL_ENTITY";
  }

  return "UNCLASSIFIED";
}


export function isPrimarySovereignEntity(
  countryIso3: string,
): boolean {
  return (
    classifyGlobalEntity(
      countryIso3,
    ) ===
    "SOVEREIGN"
  );
}
