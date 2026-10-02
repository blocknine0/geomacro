#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const read = (filePath) => fs.readFileSync(filePath, "utf8");

const excludedPublicDocSlugs = new Set([
  "34-prediction-markets",
  "35-cctp-bridge-and-swap",
  "36-arc-testnet",
]);

const publicDocFiles = fs
  .readdirSync("src/content/docs", { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
  .filter((entry) => !excludedPublicDocSlugs.has(entry.name.replace(/\.md$/, "")))
  .map((entry) => path.join("src/content/docs", entry.name));

const buyerFacingFiles = [
  "src/components/site-shell.tsx",
  "src/components/home/commercial-home.tsx",
  "src/components/sections/onchain-section.tsx",
  "src/components/sections/roadmap-section.tsx",
  "src/components/risk-indices/risk-indices-workspace.tsx",
  "src/routes/index.tsx",
  "src/routes/intelligence.tsx",
  "src/routes/global-risk.tsx",
  "src/routes/risk-gate.tsx",
  "src/routes/ask-geomacro.tsx",
  "src/routes/data-api.tsx",
  "src/routes/institutional.tsx",
  "src/routes/ecosystem.tsx",
  "src/routes/research.tsx",
  "src/routes/docs.tsx",
  "src/routes/about.tsx",
  "src/routes/roadmap.tsx",
  "src/routes/contact.tsx",
  "src/routes/arena.tsx",
  "src/routes/bridge-swap.tsx",
  "src/routes/demo.tsx",
  "public/llms.txt",
  "public/agent-commerce.md",
  "public/integrations/nevermined.md",
  ...publicDocFiles,
];

const forbiddenBuyerFacingPatterns = [
  { label: "evaluation-network wording", pattern: /\btestnet\b/i },
  { label: "pre-revenue wording", pattern: /\bpre[- ]?revenue\b/i },
  { label: "early-stage wording", pattern: /\bearly[- ]?stage\b/i },
  { label: "pre-launch wording", pattern: /\bpre[- ]?launch\b/i },
];

const failures = [];

for (const filePath of buyerFacingFiles) {
  const source = read(filePath);
  for (const rule of forbiddenBuyerFacingPatterns) {
    if (rule.pattern.test(source)) {
      failures.push(`${filePath}: contains ${rule.label}`);
    }
  }
}

const shell = read("src/components/site-shell.tsx");
if (shell.includes("/testnet-access") || shell.includes("Testnet API")) {
  failures.push("src/components/site-shell.tsx: retired evaluation access is still linked from public navigation");
}

const docsContent = read("src/lib/docs-content.ts");
for (const slug of excludedPublicDocSlugs) {
  if (!docsContent.includes(`"${slug}"`)) {
    failures.push(`src/lib/docs-content.ts: retired technical-proof document ${slug} is not excluded from public docs`);
  }
}

const sitemap = read("public/sitemap.xml");
for (const slug of excludedPublicDocSlugs) {
  if (sitemap.includes(`/docs/${slug}`)) {
    failures.push(`public/sitemap.xml: retired technical-proof document ${slug} remains discoverable`);
  }
}

const legacyRoute = read("src/routes/testnet-access.tsx");
if (!legacyRoute.includes('redirect({ to: "/data-api"') || legacyRoute.includes("TESTNET_INTELLIGENCE")) {
  failures.push("src/routes/testnet-access.tsx: legacy public route must redirect to /data-api");
}

const legacyServerRoute = read("server/routes/testnet-access.get.ts");
if (!legacyServerRoute.includes('sendRedirect(event, "/data-api", 308)')) {
  failures.push("server/routes/testnet-access.get.ts: legacy server route must redirect to /data-api");
}

const legacyConsole = read("server/routes/testnet-console.get.ts");
if (!legacyConsole.includes('sendRedirect(event, "/data-api", 308)')) {
  failures.push("server/routes/testnet-console.get.ts: legacy console must redirect to /data-api");
}

const commerceStatus = read("src/components/agent-commerce-status.tsx");
for (const phrase of ["testnet proof", "controlled pre-launch", "settlement is not commercial revenue"]) {
  if (commerceStatus.toLowerCase().includes(phrase)) {
    failures.push(`src/components/agent-commerce-status.tsx: user-visible legacy phrase remains: ${phrase}`);
  }
}

if (failures.length) {
  for (const failure of failures) console.error(`::error::${failure}`);
  process.exit(1);
}

console.log(
  `Public production surface guard passed for ${buyerFacingFiles.length} buyer-facing files, ${publicDocFiles.length} published docs and legacy-route redirects.`,
);
