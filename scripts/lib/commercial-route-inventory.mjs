import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ALLOWED_CLASSIFICATIONS = new Set([
  "PRODUCTION",
  "TESTNET",
  "DEMO",
  "EXPERIMENTAL",
  "INTERNAL",
  "REMOVE",
  "REDIRECT",
]);

const REQUIRED_PRODUCTION_ROUTES = [
  "/",
  "/intelligence",
  "/global-risk",
  "/risk-indices",
  "/ask-geomacro",
  "/risk-gate",
  "/data-api",
  "/institutional",
  "/docs",
  "/research",
  "/pricing",
  "/contact",
];

function filesUnder(root) {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

function routePathsFromGeneratedTree(source) {
  return [...new Set([...source.matchAll(/\n\s*path:\s*'([^']+)'\s*,/g)].map((match) => match[1]))].sort();
}

function readRegistry(root) {
  const registry = JSON.parse(readFileSync(join(root, "config/commercial-route-disposition.json"), "utf8"));
  if (registry?.schema !== "geomacro.commercial-route-disposition.v1") {
    throw new Error("COMMERCIAL_ROUTE_REGISTRY_SCHEMA_INVALID");
  }
  if (!registry.routes || typeof registry.routes !== "object" || Array.isArray(registry.routes)) {
    throw new Error("COMMERCIAL_ROUTE_REGISTRY_ROUTES_INVALID");
  }
  for (const [route, disposition] of Object.entries(registry.routes)) {
    if (!route.startsWith("/")) throw new Error(`COMMERCIAL_ROUTE_PATH_INVALID:${route}`);
    if (!ALLOWED_CLASSIFICATIONS.has(String(disposition?.classification ?? ""))) {
      throw new Error(`COMMERCIAL_ROUTE_CLASSIFICATION_INVALID:${route}`);
    }
    if (!String(disposition?.status ?? "").trim()) {
      throw new Error(`COMMERCIAL_ROUTE_STATUS_REQUIRED:${route}`);
    }
  }
  return registry;
}

function primaryNavigation(root) {
  const shell = readFileSync(join(root, "src/components/site-shell.tsx"), "utf8");
  const block = shell.match(/const PRIMARY_NAV = \[[\s\S]*?\] as const;/)?.[0];
  if (!block) throw new Error("COMMERCIAL_ROUTE_PRIMARY_NAV_BLOCK_MISSING");
  return [...block.matchAll(/to:\s*"([^"]+)"/g)].map((match) => match[1]);
}

function nitroEndpoint(root, file) {
  let rel = relative(join(root, "server/api"), file).split(sep).join("/");
  rel = rel.replace(/\.(?:get|post|put|patch|delete|head|options)\.(?:ts|js|mjs)$/i, "");
  rel = rel.replace(/\.(?:ts|js|mjs)$/i, "");
  rel = rel.replace(/(^|\/)index$/i, "");
  return `/api/${rel}`.replace(/\/$/, "");
}

function classifyNitroEndpoint(endpoint) {
  if (/^\/api\/(?:public(?:\/|-)|commercial\/|x402\/)/.test(endpoint)) {
    return "PRODUCTION";
  }
  if (/^\/api\/(?:testnet|testnet-|testnet\/)/.test(endpoint)) {
    return "TESTNET";
  }
  if (/^\/api\/(?:demo|demo-|tameion|tameion-|goat|goat\/)/.test(endpoint)) {
    return "DEMO";
  }
  return "INTERNAL";
}

export function buildCommercialRouteInventory(root = process.cwd()) {
  const registry = readRegistry(root);
  const generatedTree = readFileSync(join(root, "src/routeTree.gen.ts"), "utf8");
  const actualRoutes = routePathsFromGeneratedTree(generatedTree);
  const registeredRoutes = Object.keys(registry.routes).sort();

  const missingDisposition = actualRoutes.filter((route) => !registry.routes[route]);
  const staleDisposition = registeredRoutes.filter((route) => !actualRoutes.includes(route));
  if (missingDisposition.length) {
    throw new Error(`COMMERCIAL_ROUTE_DISPOSITION_MISSING:${missingDisposition.join(",")}`);
  }
  if (staleDisposition.length) {
    throw new Error(`COMMERCIAL_ROUTE_DISPOSITION_STALE:${staleDisposition.join(",")}`);
  }

  for (const route of REQUIRED_PRODUCTION_ROUTES) {
    const disposition = registry.routes[route];
    if (!disposition || disposition.classification !== "PRODUCTION") {
      throw new Error(`COMMERCIAL_ROUTE_REQUIRED_PRODUCTION_MISSING:${route}`);
    }
  }

  const primaryNav = primaryNavigation(root);
  for (const route of primaryNav) {
    const disposition = registry.routes[route];
    if (!disposition || disposition.classification !== "PRODUCTION") {
      throw new Error(`COMMERCIAL_ROUTE_PRIMARY_NAV_NOT_PRODUCTION:${route}`);
    }
  }

  for (const [route, disposition] of Object.entries(registry.routes)) {
    if (route.startsWith("/api/x402/") && disposition.status !== "CONTROLLED_PRELAUNCH") {
      throw new Error(`COMMERCIAL_ROUTE_X402_STATUS_NOT_PRELAUNCH:${route}`);
    }
  }
  if (registry.routes["/risk-gate"]?.status !== "PRIVATE_PILOT") {
    throw new Error("COMMERCIAL_ROUTE_RISK_GATE_STATUS_NOT_PRIVATE_PILOT");
  }

  const serverApiRoot = join(root, "server/api");
  const nitroRoutes = statSync(serverApiRoot).isDirectory()
    ? filesUnder(serverApiRoot)
        .filter((file) => /\.(?:ts|js|mjs)$/.test(file))
        .map((file) => {
          const endpoint = nitroEndpoint(root, file);
          return {
            endpoint,
            classification: classifyNitroEndpoint(endpoint),
            file: relative(root, file).split(sep).join("/"),
          };
        })
        .sort((a, b) => a.endpoint.localeCompare(b.endpoint))
    : [];

  const classificationCounts = {};
  for (const disposition of Object.values(registry.routes)) {
    classificationCounts[disposition.classification] =
      Number(classificationCounts[disposition.classification] ?? 0) + 1;
  }

  return {
    schema: "geomacro.commercial-route-inventory-proof.v1",
    ok: true,
    tanstack_route_count: actualRoutes.length,
    tanstack_routes: actualRoutes.map((route) => ({ route, ...registry.routes[route] })),
    primary_navigation: primaryNav,
    classification_counts: classificationCounts,
    nitro_api_count: nitroRoutes.length,
    nitro_api_routes: nitroRoutes,
    policy: {
      unregistered_tanstack_route_behavior: "FAIL_CLOSED",
      unknown_nitro_api_behavior: "INTERNAL_ONLY",
      testnet_demo_experimental_primary_nav_allowed: false,
      x402_status: "CONTROLLED_PRELAUNCH",
      risk_gate_status: "PRIVATE_PILOT",
    },
  };
}
