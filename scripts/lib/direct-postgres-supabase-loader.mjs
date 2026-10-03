const SHIM_URL = "geomacro:gri-direct-postgres-supabase";
const NO_GUARDIAN_FETCH_URL = "geomacro:no-guardian-node-fetch";
const HELPER_SUFFIX = "/scripts/lib/gri-db-client.mjs";
const INGEST_SUFFIX = "/scripts/ingest-news.js";

export async function resolve(specifier, context, nextResolve) {
  const direct = String(process.env.GRI_DB_MODE ?? "").trim().toLowerCase() === "direct_postgres";
  const helperSelfImport = String(context.parentURL ?? "").endsWith(HELPER_SUFFIX);
  const ingestImport = String(context.parentURL ?? "").endsWith(INGEST_SUFFIX);
  const guardianDisabled =
    String(process.env.GEOMACRO_DISABLE_GUARDIAN ?? "").trim().toLowerCase() === "true";

  if (direct && specifier === "@supabase/supabase-js" && !helperSelfImport) {
    return { url: SHIM_URL, shortCircuit: true };
  }

  if (direct && guardianDisabled && ingestImport && specifier === "node-fetch") {
    return { url: NO_GUARDIAN_FETCH_URL, shortCircuit: true };
  }

  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url === SHIM_URL) {
    const helperUrl = new URL("./gri-db-client.mjs", import.meta.url).href;
    return {
      format: "module",
      shortCircuit: true,
      source: `
        import { createGriDbClient } from ${JSON.stringify(helperUrl)};
        export function createClient() { return createGriDbClient(); }
      `,
    };
  }

  if (url === NO_GUARDIAN_FETCH_URL) {
    const helperUrl = new URL("./no-guardian-node-fetch.mjs", import.meta.url).href;
    return {
      format: "module",
      shortCircuit: true,
      source: `
        export { default } from ${JSON.stringify(helperUrl)};
      `,
    };
  }

  return nextLoad(url, context);
}
