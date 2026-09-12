#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const EXPECTED_SUPABASE_REF = "ldpwajisioljyjtojvfx";
const ALIGNMENT_CONTRACT = "github-main-external-supabase-lovable-v1";

function read(path) {
  return readFileSync(join(ROOT, path), "utf8");
}

function fail(message) {
  console.error(`❌ ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`✅ ${message}`);
}

function requireText(path, text, label = text) {
  const value = read(path);
  if (!value.includes(text)) fail(`${path} is missing ${label}`);
  else pass(`${path}: ${label}`);
}

function walk(dir) {
  const full = join(ROOT, dir);
  const out = [];
  for (const name of readdirSync(full)) {
    const path = join(full, name);
    const rel = relative(ROOT, path).replaceAll("\\", "/");
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...walk(rel));
    else out.push(rel);
  }
  return out;
}

console.log("Geomacro GitHub ↔ Supabase ↔ Lovable alignment guard\n");

if (!existsSync(join(ROOT, "bun.lock"))) fail("bun.lock must be committed");
else pass("bun.lock is the canonical dependency lock");

if (existsSync(join(ROOT, "package-lock.json"))) {
  fail("package-lock.json must not exist; Lovable/GitHub builds must use Bun only");
} else {
  pass("no npm lockfile drift");
}

const pkg = JSON.parse(read("package.json"));
if (pkg.packageManager !== "bun@1.4.2") fail("packageManager must remain bun@1.4.2");
else pass("Bun toolchain is pinned");

if (pkg.scripts?.["hosting:verify"] !== "node scripts/ops/verify-hosting-alignment.mjs") {
  fail("package.json must expose the canonical hosting:verify command");
} else {
  pass("hosting alignment has a stable local/CI command");
}

if (!pkg.devDependencies?.["@lovable.dev/vite-tanstack-config"]) {
  fail("Lovable TanStack Vite compatibility package is missing");
} else {
  pass("Lovable TanStack build compatibility is retained");
}

const vite = read("vite.config.ts");
if (!vite.includes('from "@lovable.dev/vite-tanstack-config"')) {
  fail("vite.config.ts must use the Lovable TanStack config wrapper");
} else {
  pass("Vite remains Lovable-compatible without using the Lovable agent");
}

const env = read(".env.example");
for (const name of [
  "APP_SUPABASE_URL=",
  "APP_SUPABASE_ANON_KEY=",
  "APP_SUPABASE_SERVICE_ROLE_KEY=",
  "SUPABASE_URL=",
  "SUPABASE_SERVICE_ROLE_KEY=",
]) {
  if (!env.includes(name)) fail(`.env.example is missing ${name}`);
}
if (!env.includes(EXPECTED_SUPABASE_REF)) {
  fail(".env.example must name the authoritative Supabase project ref");
} else {
  pass("runtime Supabase env contract is documented");
}

const browserFiles = walk("src").filter(
  (path) =>
    /\.(ts|tsx|js|jsx)$/.test(path) &&
    !path.includes("/__tests__/"),
);
const forbiddenBrowserEnv = [];
for (const path of browserFiles) {
  const value = read(path);
  if (/import\.meta\.env\.VITE_SUPABASE_(URL|ANON_KEY|PUBLISHABLE_KEY)/.test(value)) {
    forbiddenBrowserEnv.push(path);
  }
}
if (forbiddenBrowserEnv.length) {
  fail(`browser source still trusts hosting Supabase env: ${forbiddenBrowserEnv.join(", ")}`);
} else {
  pass("browser source is independent of hosting-injected Supabase credentials");
}

const feed = read("src/lib/supabase-feed.ts");
for (const marker of [
  EXPECTED_SUPABASE_REF,
  "/api/public-data-proxy?target=",
  'const PUBLIC_READ_PROXY_KEY = "public-read-proxy"',
  'return new Response(JSON.stringify({ error: "Unsupported public data operation" })',
]) {
  if (!feed.includes(marker)) fail(`supabase-feed.ts is missing ${marker}`);
}
if (!/browser-visible Supabase credentials are never a source of\s*\n \* truth/.test(feed)) {
  fail("supabase-feed.ts must document the browser authority boundary");
} else {
  pass("frontend reads are pinned to the same-origin public data proxy");
}

const proxy = read("src/routes/api.public-data-proxy.ts");
if (!proxy.includes("process.env.APP_SUPABASE_URL")) fail("public proxy must use APP_SUPABASE_URL");
if (!proxy.includes("process.env.APP_SUPABASE_ANON_KEY")) fail("public proxy must use APP_SUPABASE_ANON_KEY");
if (proxy.includes("APP_SUPABASE_SERVICE_ROLE_KEY")) fail("public proxy must never use the service-role key");
else pass("public read proxy remains anon/RLS scoped");

const appDb = read("src/lib/supabase-app.server.ts");
if (!appDb.includes("process.env.APP_SUPABASE_SERVICE_ROLE_KEY")) {
  fail("app server client must recognize APP_SUPABASE_SERVICE_ROLE_KEY");
} else {
  pass("hosted SSR/API writes use the documented APP service-role variable");
}

const riskDb = read("src/lib/risk-supabase.server.ts");
if (!riskDb.includes(EXPECTED_SUPABASE_REF)) fail("risk client is not pinned to the authoritative project");
if (riskDb.includes("APP_SUPABASE_ANON_KEY")) fail("risk client must never fall back to anon");
else pass("Risk Object/Risk Gate DB client is service-role-only and project-pinned");

for (const path of [
  "scripts/diagnose-risk-object-event-window.ts",
  "scripts/diagnose-live-fragment-backlog.ts",
]) {
  const value = read(path);
  if (value.includes("VITE_SUPABASE_URL")) fail(`${path} must not use browser Supabase env`);
  if (!value.includes("APP_SUPABASE_URL")) fail(`${path} must accept APP_SUPABASE_URL`);
  if (!value.includes("APP_SUPABASE_SERVICE_ROLE_KEY")) fail(`${path} must accept APP_SUPABASE_SERVICE_ROLE_KEY`);
}
pass("diagnostic scripts use server-only Supabase credentials");

requireText("src/routes/api.health.ts", ALIGNMENT_CONTRACT, "deployment alignment contract");
requireText("src/routes/api.health.ts", EXPECTED_SUPABASE_REF, "authoritative Supabase project marker");
requireText(".github/workflows/live-testnet-api-smoke.yml", ALIGNMENT_CONTRACT, "live alignment smoke marker");
requireText("docs/HOSTING_ALIGNMENT.md", "Publish changes", "zero-credit publish workflow");

if (!process.exitCode) {
  console.log("\nPASS: GitHub source, Lovable-compatible build, browser data boundary and authoritative Supabase runtime are aligned.");
}
