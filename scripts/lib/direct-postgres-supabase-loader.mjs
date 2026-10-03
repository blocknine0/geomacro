const SHIM_URL = "geomacro:gri-direct-postgres-supabase";
const HELPER_SUFFIX = "/scripts/lib/gri-db-client.mjs";

export async function resolve(specifier, context, nextResolve) {
  const direct = String(process.env.GRI_DB_MODE ?? "").trim().toLowerCase() === "direct_postgres";
  const helperSelfImport = String(context.parentURL ?? "").endsWith(HELPER_SUFFIX);

  if (direct && specifier === "@supabase/supabase-js" && !helperSelfImport) {
    return { url: SHIM_URL, shortCircuit: true };
  }

  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url !== SHIM_URL) return nextLoad(url, context);

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
