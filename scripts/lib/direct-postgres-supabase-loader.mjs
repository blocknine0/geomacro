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
        // Some canonical scripts still perform legacy Supabase REST
        // credential presence checks before calling createClient(). In direct
        // Postgres mode this virtual module is evaluated first, so bounded
        // non-network sentinels let those obsolete guards pass without
        // restoring a REST dependency or exposing a service-role secret.
        // createClient() below ignores its arguments and always validates/uses
        // the authoritative SUPABASE_DB_URL through createGriDbClient().
        process.env.SUPABASE_URL ||= "https://direct-postgres.invalid";
        process.env.SUPABASE_SERVICE_ROLE_KEY ||= "direct-postgres-no-rest";
        import { createGriDbClient } from ${JSON.stringify(helperUrl)};

        function nextPrefix(prefix) {
          if (!prefix) throw new Error("DIRECT_POSTGRES_LIKE_EMPTY_PREFIX");
          const chars = [...prefix];
          const last = chars.pop();
          const code = last.codePointAt(0);
          if (!Number.isInteger(code) || code >= 0x10ffff) {
            throw new Error("DIRECT_POSTGRES_LIKE_PREFIX_RANGE_INVALID");
          }
          return chars.join("") + String.fromCodePoint(code + 1);
        }

        function withPrefixLikeCompat(client) {
          const originalFrom = client.from.bind(client);
          return new Proxy(client, {
            get(target, prop, receiver) {
              if (prop !== "from") return Reflect.get(target, prop, receiver);
              return (table) => {
                const builder = originalFrom(table);
                let proxy;
                proxy = new Proxy(builder, {
                  get(query, queryProp, queryReceiver) {
                    if (queryProp === "like") {
                      return (column, pattern) => {
                        const raw = String(pattern ?? "");
                        if (!raw.endsWith("%") || /[%_]/.test(raw.slice(0, -1))) {
                          throw new Error("DIRECT_POSTGRES_LIKE_SUPPORTS_PREFIX_ONLY");
                        }
                        const prefix = raw.slice(0, -1);
                        query.gte(column, prefix);
                        query.lt(column, nextPrefix(prefix));
                        return proxy;
                      };
                    }
                    const value = Reflect.get(query, queryProp, queryReceiver);
                    if (typeof value !== "function") return value;
                    return (...args) => {
                      const result = value.apply(query, args);
                      return result === query ? proxy : result;
                    };
                  },
                });
                return proxy;
              };
            },
          });
        }

        export function createClient() {
          return withPrefixLikeCompat(createGriDbClient());
        }
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
