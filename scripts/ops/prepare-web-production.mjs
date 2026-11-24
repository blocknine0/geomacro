import { mkdirSync, readFileSync, readdirSync, lstatSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function prepareWebProduction({ root = process.cwd(), sha = process.env.GITHUB_SHA, target = "staging" } = {}) {
  if (!/^[a-f0-9]{40}$/u.test(sha ?? "")) throw Error("WEB_PRODUCTION_EXACT_SHA_REQUIRED");
  if (target !== "staging" && target !== "production") throw Error("WEB_PRODUCTION_TARGET_INVALID");
  const dir = resolve(root, ".output/server");
  const original = JSON.parse(readFileSync(resolve(dir, "wrangler.json"), "utf8"));
  if (original.main !== "index.mjs" || original.assets?.directory !== "../public" ||
      original.assets?.binding !== "ASSETS" || original.no_bundle !== true ||
      !original.compatibility_flags?.includes("nodejs_compat") ||
      !original.compatibility_flags?.includes("global_fetch_strictly_public")) {
    throw Error("WEB_PRODUCTION_BUILD_LAYOUT_UNVERIFIED");
  }

  const config = {
    name: target === "production" ? "geomacro-web-production" : "geomacro-web-production-staging",
    main: "production.mjs",
    compatibility_date: original.compatibility_date,
    compatibility_flags: ["nodejs_compat", "global_fetch_strictly_public"],
    no_bundle: true,
    rules: [{ type: "ESModule", globs: ["**/*.mjs", "**/*.js"] }],
    assets: { binding: "ASSETS", directory: "../public", run_worker_first: true },
    workers_dev: target !== "production",
    preview_urls: false,
    vars: {
      GEOMACRO_SUPABASE_RUNTIME_MODE: "standby",
      ...(target === "production" ? { GEOMACRO_ASK_FREE_GROQ_ENABLED: "true" } : {}),
    },
    observability: { enabled: false },
  };
  if (target === "production") {
    config.routes = [
      { pattern: "geomacro.live", custom_domain: true },
      { pattern: "www.geomacro.live", custom_domain: true },
    ];
  }

  let bytes = 0;
  function visit(path) {
    for (const name of readdirSync(path)) {
      const file = resolve(path, name);
      const stat = lstatSync(file);
      if (stat.isSymbolicLink()) throw Error("WEB_PRODUCTION_BUILD_SYMLINK_REJECTED");
      if (stat.isDirectory()) visit(file);
      else bytes += stat.size;
    }
  }
  visit(dir);
  if (bytes > 16 * 1024 * 1024) throw Error("WEB_PRODUCTION_BUILD_SIZE_REJECTED");

  const publicDir = resolve(root, ".output/public");
  mkdirSync(resolve(publicDir, ".well-known"), { recursive: true });
  writeFileSync(resolve(publicDir, ".well-known/geomacro-build.json"), JSON.stringify({
    schema_version: "geomacro.deployment-build.v1",
    canonical_repository: "blocknine0/geomacro",
    canonical_main_sha: sha,
    production_activation_performed: target === "production",
    deployment_mode: target === "production" ? "production" : "production-capable-staging-no-funds",
  }) + "\n");
  writeFileSync(resolve(dir, "production-entry.mjs"), readFileSync(resolve(root, "workers/web-production/entry.mjs")));
  writeFileSync(resolve(dir, "production.mjs"),
    'import app from "./index.mjs";\nimport {productionWebsite} from "./production-entry.mjs";\nexport default productionWebsite(app);\n');
  const output = resolve(dir, "production-wrangler.json");
  writeFileSync(output, JSON.stringify(config, null, 2) + "\n");
  return {
    schema: target === "production" ? "geomacro.web-production-build.v1" : "geomacro.web-production-staging-build.v1",
    canonical_main_sha: sha,
    config: relative(root, output),
    server_bytes: bytes,
    target,
    workers_dev_only: target !== "production",
    custom_domains_or_routes: target === "production",
    new_private_bindings: false,
    supabase_runtime_mode: "standby",
    payment_authorized: false,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length > 2 || (args.length > 0 && (args[0] !== "--target" || !["staging", "production"].includes(args[1])))) {
    throw Error("WEB_PRODUCTION_ARGUMENTS_INVALID");
  }
  console.log(JSON.stringify(prepareWebProduction({ target: args[1] ?? "staging" })));
}
