import { resolveNs } from "node:dns/promises";
import { pathToFileURL } from "node:url";

const DOMAIN = "geomacro.live";
const STAGING_SERVICE = "geomacro-web-production-staging";
const EXPECTED_PRODUCTION_SERVICE = "geomacro-web-production";
const SHA = /^[a-f0-9]{40}$/u;

function normalizedNs(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter(value => typeof value === "string")
    .map(value => value.toLowerCase().replace(/\.$/u, "").trim())
    .filter(value => /^[a-z0-9.-]{3,255}$/u.test(value)))].sort();
}

function serviceForDomain(domains, hostname) {
  const matches = Array.isArray(domains)
    ? domains.filter(value => value?.hostname === hostname && value.enabled === true)
    : [];
  return matches.length === 1 && typeof matches[0].service === "string"
    ? matches[0].service : null;
}

function serviceForRoute(routes, hostname) {
  const matches = Array.isArray(routes) ? routes.filter(item =>
    item?.pattern === hostname + "/*" || item?.pattern === hostname) : [];
  return matches.length === 1 && typeof matches[0].script === "string"
    ? matches[0].script : null;
}

/** Distinguish live production authority from isolated staging, without writing DNS or Worker routes. */
export function evaluateProductionDomainAuthority({
  zone = null, delegatedNameservers = null, customDomains = null, routes = null,
  marker = null, markerHttpStatus = 0, wwwHttpStatus = 0, wwwLocation = null,
  expectedSha = null,
} = {}) {
  const assignedNs = normalizedNs(zone?.name_servers);
  const delegatedNs = normalizedNs(delegatedNameservers);
  const nsMatch = assignedNs.length > 0 && delegatedNs.length > 0 &&
    assignedNs.length === delegatedNs.length && assignedNs.every((value, i) => value === delegatedNs[i]);
  const apexCustomService = serviceForDomain(customDomains, DOMAIN);
  const wwwCustomService = serviceForDomain(customDomains, "www." + DOMAIN);
  const apexRouteService = serviceForRoute(routes, DOMAIN);
  const wwwRouteService = serviceForRoute(routes, "www." + DOMAIN);
  const apexService = apexCustomService ?? apexRouteService;
  const wwwService = wwwCustomService ?? wwwRouteService;
  const markerSha = SHA.test(marker?.canonical_main_sha ?? "") ? marker.canonical_main_sha : null;
  const expected = SHA.test(expectedSha ?? "") ? expectedSha : null;
  const exactSha = !!expected && markerSha === expected;
  const canonicalRedirect = [301, 302, 307, 308].includes(wwwHttpStatus) &&
    typeof wwwLocation === "string" &&
    (wwwLocation === "https://" + DOMAIN + "/" || wwwLocation === "https://" + DOMAIN);
  const workerBindingsValid = apexService === EXPECTED_PRODUCTION_SERVICE &&
    wwwService === EXPECTED_PRODUCTION_SERVICE &&
    apexService !== STAGING_SERVICE && wwwService !== STAGING_SERVICE;
  const sourceProven = zone?.name === DOMAIN && zone.status === "active" &&
    nsMatch && workerBindingsValid && markerHttpStatus === 200 && exactSha &&
    marker?.production_activation_performed === true && canonicalRedirect;
  return {
    schema: "geomacro.production-domain-hosting-audit.v1",
    domain: DOMAIN,
    cloudflare_zone: {
      present_in_account: zone?.name === DOMAIN,
      status: zone?.name === DOMAIN ? String(zone.status ?? "unknown") : "missing",
      assigned_nameservers: assignedNs,
      delegated_nameservers: delegatedNs,
      nameservers_match: nsMatch,
    },
    routing: {
      apex_custom_domain_service: apexCustomService,
      www_custom_domain_service: wwwCustomService,
      apex_worker_route_service: apexRouteService,
      www_worker_route_service: wwwRouteService,
      expected_production_worker: EXPECTED_PRODUCTION_SERVICE,
      production_worker_binding_verified: workerBindingsValid,
      staging_worker_used_for_production: [apexService, wwwService].includes(STAGING_SERVICE),
    },
    public_https: {
      build_marker_http_status: markerHttpStatus,
      build_marker_sha: markerSha,
      matches_expected_sha: exactSha,
      production_activation_marker: marker?.production_activation_performed === true,
      www_http_status: wwwHttpStatus,
      www_redirects_to_canonical_apex: canonicalRedirect,
    },
    production_hostname_cloudflare_serving_verified: sourceProven,
    complete_production_cutover_approved: false,
    read_only: true,
  };
}

async function fetchJson(fetchImpl, url, headers = {}) {
  const res = await fetchImpl(url, {
    headers, redirect: "manual", signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw Error("HTTP_" + res.status);
  return await res.json();
}

export async function auditProductionDomain({
  env = process.env, fetchImpl = fetch, resolveNsImpl = resolveNs,
} = {}) {
  const failures = [];
  const account = env.CLOUDFLARE_ACCOUNT_ID ?? "";
  const token = env.CLOUDFLARE_API_TOKEN ?? "";
  let zone = null;
  let customDomains = null;
  let routes = null;
  let marker = null;
  let markerHttpStatus = 0;
  let wwwHttpStatus = 0;
  let wwwLocation = null;
  let delegatedNameservers = null;
  const api = "https://api.cloudflare.com/client/v4";
  if (/^[a-f0-9]{32}$/u.test(account) && token.length >= 20) {
    const headers = { Authorization: "Bearer " + token };
    try {
      const body = await fetchJson(fetchImpl, api + "/zones?account.id=" + account + "&name=" + DOMAIN + "&per_page=50", headers);
      if (body?.success !== true || !Array.isArray(body.result) || body.result.length > 1 ||
          (body.result_info?.total_pages ?? 1) > 1) throw Error("INCOMPLETE_ZONE_RESPONSE");
      zone = body.result.find(value => value?.name === DOMAIN) ?? null;
    } catch { failures.push("CLOUDFLARE_ZONE_INVENTORY_UNAVAILABLE"); }
    try {
      const body = await fetchJson(fetchImpl, api + "/accounts/" + account + "/workers/domains?per_page=100", headers);
      if (body?.success !== true || !Array.isArray(body.result) ||
          (body.result_info?.total_pages ?? 1) > 1) throw Error("INCOMPLETE_WORKER_DOMAINS");
      customDomains = body.result;
    } catch { failures.push("CLOUDFLARE_WORKER_DOMAIN_INVENTORY_UNAVAILABLE"); }
    if (zone && /^[a-f0-9]{32}$/u.test(zone.id ?? "")) {
      try {
        const body = await fetchJson(fetchImpl, api + "/zones/" + zone.id + "/workers/routes", headers);
        if (body?.success !== true || !Array.isArray(body.result)) throw Error("ROUTES_INVALID");
        routes = body.result;
      } catch { failures.push("CLOUDFLARE_WORKER_ROUTE_INVENTORY_UNAVAILABLE"); }
    }
  } else failures.push("CLOUDFLARE_READ_CREDENTIALS_MISSING");

  try { delegatedNameservers = await resolveNsImpl(DOMAIN); }
  catch { failures.push("PUBLIC_DELEGATED_NAMESERVERS_UNAVAILABLE"); }
  try {
    const response = await fetchImpl("https://" + DOMAIN + "/.well-known/geomacro-build.json", {
      redirect: "manual", signal: AbortSignal.timeout(12_000),
      headers: { Accept: "application/json", "Cache-Control": "no-cache" },
    });
    markerHttpStatus = response.status;
    if (response.status === 200 && (response.headers.get("content-type") ?? "").includes("json")) {
      marker = await response.json().catch(() => null);
    }
  } catch { failures.push("PUBLIC_APEX_HTTPS_MARKER_UNAVAILABLE"); }
  try {
    const response = await fetchImpl("https://www." + DOMAIN + "/", {
      method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(12_000),
    });
    wwwHttpStatus = response.status;
    wwwLocation = response.headers.get("location");
    await response.body?.cancel();
  } catch { failures.push("PUBLIC_WWW_HTTPS_UNAVAILABLE"); }
  const evidence = evaluateProductionDomainAuthority({
    zone, delegatedNameservers, customDomains, routes,
    marker, markerHttpStatus, wwwHttpStatus, wwwLocation,
    expectedSha: env.EXPECTED_CANONICAL_MAIN_SHA ?? env.GITHUB_SHA,
  });
  return { ...evidence, probe_errors: failures };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(await auditProductionDomain()));
}
