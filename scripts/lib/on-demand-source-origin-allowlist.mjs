import {isPinnedCountryPublisherHost} from "./on-demand-country-publisher-mesh.mjs";

/**
 * Fixed official origins plus pinned country-publisher origins for bounded
 * customer-side first-party discovery and no-funds production verifiers.
 *
 * A hostname match alone never grants a source commercial rights, original
 * article status, independent corroboration, signing or payment eligibility.
 * Callers also enforce HTTPS, no redirects, source-specific URL paths,
 * max network attempts and publication-time verification.
 */
export const ON_DEMAND_OFFICIAL_HOSTS = Object.freeze([
  "api.worldbank.org",
  "api.gdeltproject.org",
  "api.reliefweb.int",
  "www.gov.uk",
  "news.un.org",
  "www.federalreserve.gov",
  "www.ecb.europa.eu",
  "www.minister.industry.gov.au",
  "api.io.canada.ca",
  "www.canada.ca",
  "press.un.org",
  "www.bis.org",
  "www.stats.gov.cn",
  "www.boj.or.jp",
  "www.iea.org",
  "www.bankofcanada.ca",
  "news.gov.bc.ca",
  "www.consilium.europa.eu",
  "www.usgs.gov",
  "www.energy.gov",
  "www.rbi.org.in",
  "www.ungeneva.org",
  "ogcapi.bgs.ac.uk",
]);
export function approvedOnDemandSourceHostname(host) {
  return typeof host === "string" &&
    (ON_DEMAND_OFFICIAL_HOSTS.includes(host)||isPinnedCountryPublisherHost(host));
}
