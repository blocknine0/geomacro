import { pathToFileURL } from "node:url";

const worker = "geomacro-web-production-staging";

export function allowedStagingBinding(binding) {
  return (binding?.type === "assets" && binding.name === "ASSETS") ||
    (binding?.type === "plain_text" && binding.name === "GEOMACRO_SUPABASE_RUNTIME_MODE" && binding.text === "standby") ||
    (binding?.type === "secret_text" && [
      "B2_ARCHIVE_READ_KEY_ID", "B2_ARCHIVE_READ_APPLICATION_KEY",
      "GEOMACRO_SECURITY_FINGERPRINT_PEPPER",
    ].includes(binding.name));
}

export function hasUnexpectedWorkerRoute(routes) {
  return !Array.isArray(routes) || routes.some(route => route?.script === worker);
}

export function workerRouteInventory(routes) {
  if (!Array.isArray(routes?.result) ||
      (routes.result_info !== undefined && !Number.isSafeInteger(routes.result_info?.total_pages))) {
    throw Error("WEB_STAGING_WORKER_ROUTE_INVENTORY_INVALID");
  }
  return { routes: routes.result, totalPages: routes.result_info?.total_pages ?? 1 };
}

export async function verifyWorkerBindings({ env = process.env, fetchImpl = fetch } = {}) {
  const account = env.CLOUDFLARE_ACCOUNT_ID ?? "";
  const token = env.CLOUDFLARE_API_TOKEN ?? "";
  const requireWorker = env.WEB_STAGING_REQUIRE_WORKER === "true";
  const requireFingerprintPepper = env.WEB_STAGING_REQUIRE_FINGERPRINT_PEPPER === "true";
  if (!/^[a-f0-9]{32}$/u.test(account) || token.length < 20) {
    throw Error("WEB_STAGING_CLOUDFLARE_AUTH_REQUIRED");
  }

  const headers = { Authorization: `Bearer ${token}` };
  const api = "https://api.cloudflare.com/client/v4";
  const base = `${api}/accounts/${account}/workers/scripts`;
  async function read(url) {
    const response = await fetchImpl(url, { headers, redirect: "error", signal: AbortSignal.timeout(15_000) });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.success !== true) throw Error("WEB_STAGING_CLOUDFLARE_METADATA_UNAVAILABLE");
    return body;
  }

  async function optionalRead(url) {
    const response = await fetchImpl(url, { headers, redirect: "error", signal: AbortSignal.timeout(15_000) });
    if (response.status === 404) return null;
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.success !== true) throw Error("WEB_STAGING_CLOUDFLARE_METADATA_UNAVAILABLE");
    return body.result;
  }

  const settings = await optionalRead(`${base}/${worker}/settings`);
  if (!settings && requireWorker) throw Error("WEB_STAGING_WORKER_NOT_DEPLOYED");
  let fingerprintPepperPresent = false;
  if (settings) {
    const bindings = settings?.bindings;
    const accepted = Array.isArray(bindings) && bindings.every(allowedStagingBinding);
    fingerprintPepperPresent = bindings?.some(binding =>
      binding.type === "secret_text" && binding.name === "GEOMACRO_SECURITY_FINGERPRINT_PEPPER") === true;
    if (!accepted || !bindings.some(binding => binding.type === "assets" && binding.name === "ASSETS") ||
        !bindings.some(binding => binding.type === "plain_text" && binding.name === "GEOMACRO_SUPABASE_RUNTIME_MODE" && binding.text === "standby")) {
      throw Error("WEB_STAGING_UNKNOWN_OR_NONISOLATED_BINDING_PRESENT");
    }
    if (requireFingerprintPepper && !fingerprintPepperPresent) {
      throw Error("WEB_STAGING_FINGERPRINT_PEPPER_MISSING");
    }
    const subdomain = await read(`${base}/${worker}/subdomain`);
    if (subdomain.result?.enabled !== true || subdomain.result?.previews_enabled !== false) {
      throw Error("WEB_STAGING_WORKERS_DEV_SUBDOMAIN_CONFIGURATION_INVALID");
    }
    const workerDomains = await read(`${api}/accounts/${account}/workers/domains?service=${worker}&per_page=100`);
    if (!Array.isArray(workerDomains.result) || workerDomains.result.some(domain =>
        domain.service === worker || domain.hostname === "geomacro.live" || domain.hostname === "www.geomacro.live")) {
      throw Error("WEB_STAGING_CUSTOM_DOMAIN_ALREADY_ATTACHED");
    }
  }

  // Worker routes are zone scoped. The routes endpoint returns a bare result
  // array, unlike list endpoints that include result_info pagination metadata.
  let page = 1;
  let totalPages = 1;
  const zones = [];
  while (page <= totalPages && page <= 100) {
    const result = await read(`${api}/zones?account.id=${account}&per_page=50&page=${page}`);
    if (!Array.isArray(result.result) || !result.result_info ||
        !Number.isSafeInteger(result.result_info.total_pages)) {
      throw Error("WEB_STAGING_ZONE_INVENTORY_UNAVAILABLE");
    }
    zones.push(...result.result);
    totalPages = result.result_info.total_pages;
    page += 1;
  }
  if (page <= totalPages) throw Error("WEB_STAGING_ZONE_INVENTORY_EXCEEDS_BOUND");
  let routeCount = 0;
  for (const zone of zones) {
    if (typeof zone?.id !== "string" || !/^[a-f0-9]{32}$/u.test(zone.id)) {
      throw Error("WEB_STAGING_ZONE_INVENTORY_INVALID");
    }
    let routePage = 1;
    let routePages = 1;
    while (routePage <= routePages && routePage <= 100) {
      const response = await read(`${api}/zones/${zone.id}/workers/routes?per_page=100&page=${routePage}`);
      const routeInventory = workerRouteInventory(response);
      routeCount += routeInventory.routes.length;
      if (hasUnexpectedWorkerRoute(routeInventory.routes)) {
        throw Error("WEB_STAGING_WORKER_ROUTE_ALREADY_ATTACHED");
      }
      routePages = routeInventory.totalPages;
      routePage += 1;
    }
    if (routePage <= routePages) throw Error("WEB_STAGING_WORKER_ROUTE_INVENTORY_EXCEEDS_BOUND");
  }

  if (requireFingerprintPepper && !fingerprintPepperPresent) {
    throw Error("WEB_STAGING_FINGERPRINT_PEPPER_MISSING");
  }
  return `WEB_STAGING_BINDINGS_ISOLATED;NO_CUSTOM_DOMAIN;NO_WORKER_ROUTES;ZONES_CHECKED=${zones.length};ROUTES_CHECKED=${routeCount};FINGERPRINT_PEPPER_PRESENT=${fingerprintPepperPresent}`;
}

async function main() {
  console.log(await verifyWorkerBindings());
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
