const account = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";
const token = process.env.CLOUDFLARE_API_TOKEN ?? "";
const worker = "geomacro-web-production-staging";
if (!/^[a-f0-9]{32}$/u.test(account) || token.length < 20) {
  throw Error("WEB_STAGING_CLOUDFLARE_AUTH_REQUIRED");
}

const headers = { Authorization: `Bearer ${token}` };
const base = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts`;
async function read(url) {
  const response = await fetch(url, { headers, redirect: "error", signal: AbortSignal.timeout(15_000) });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success !== true) throw Error("WEB_STAGING_CLOUDFLARE_METADATA_UNAVAILABLE");
  return body.result;
}

async function optionalRead(url) {
  const response = await fetch(url, { headers, redirect: "error", signal: AbortSignal.timeout(15_000) });
  if (response.status === 404) return null;
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success !== true) throw Error("WEB_STAGING_CLOUDFLARE_METADATA_UNAVAILABLE");
  return body.result;
}

const settings = await optionalRead(`${base}/${worker}/settings`);
if (!settings && process.env.WEB_STAGING_REQUIRE_WORKER === "true") {
  throw Error("WEB_STAGING_WORKER_NOT_DEPLOYED");
}
if (settings) {
  const bindings = settings?.bindings;
  const accepted = Array.isArray(bindings) && bindings.every(binding =>
    (binding.type === "assets" && binding.name === "ASSETS") ||
    (binding.type === "plain_text" && binding.name === "GEOMACRO_SUPABASE_RUNTIME_MODE" && binding.text === "standby") ||
    (binding.type === "secret_text" && [
      "B2_ARCHIVE_READ_KEY_ID", "B2_ARCHIVE_READ_APPLICATION_KEY",
    ].includes(binding.name)));
  if (!accepted || !bindings.some(binding => binding.type === "assets" && binding.name === "ASSETS") ||
      !bindings.some(binding => binding.type === "plain_text" && binding.name === "GEOMACRO_SUPABASE_RUNTIME_MODE" && binding.text === "standby")) {
    throw Error("WEB_STAGING_UNKNOWN_OR_NONISOLATED_BINDING_PRESENT");
  }
  const subdomain = await read(`${base}/${worker}/subdomain`);
  if (subdomain?.enabled !== true || subdomain?.previews_enabled !== false) {
    throw Error("WEB_STAGING_WORKERS_DEV_SUBDOMAIN_CONFIGURATION_INVALID");
  }
  const workerDomains = await read(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/domains?service=${worker}&per_page=100`);
  if (!Array.isArray(workerDomains) || workerDomains.some(domain => domain.service === worker ||
      domain.hostname === "geomacro.live" || domain.hostname === "www.geomacro.live")) {
    throw Error("WEB_STAGING_CUSTOM_DOMAIN_ALREADY_ATTACHED");
  }
}

console.log("WEB_STAGING_BINDINGS_ISOLATED;NO_CUSTOM_DOMAIN;NO_DATABASE_OR_DURABLE_OBJECT_BINDINGS");
