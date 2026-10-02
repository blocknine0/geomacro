#!/usr/bin/env node
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

const buyerFacingFiles = [
  "src/components/site-shell.tsx",
  "src/components/sections/onchain-section.tsx",
  "src/routes/docs.tsx",
  "src/content/docs/29-revenue-architecture.md",
  "public/llms.txt",
  "public/agent-commerce.md",
  "public/integrations/nevermined.md",
];

const forbiddenBuyerFacingPatterns = [
  { label: "evaluation-network wording", pattern: /\btestnet\b/i },
  { label: "pre-revenue wording", pattern: /\bpre[- ]?revenue\b/i },
  { label: "early-stage wording", pattern: /\bearly[- ]?stage\b/i },
  { label: "pre-launch wording", pattern: /\bpre[- ]?launch\b/i },
];

const failures = [];

for (const path of buyerFacingFiles) {
  const source = read(path);
  for (const rule of forbiddenBuyerFacingPatterns) {
    if (rule.pattern.test(source)) {
      failures.push(`${path}: contains ${rule.label}`);
    }
  }
}

const shell = read("src/components/site-shell.tsx");
if (shell.includes("/testnet-access") || shell.includes("Testnet API")) {
  failures.push("src/components/site-shell.tsx: retired evaluation access is still linked from public navigation");
}

const docsContent = read("src/lib/docs-content.ts");
if (!docsContent.includes('PUBLIC_DOCS_EXCLUDED_SLUGS = new Set(["36-arc-testnet"])')) {
  failures.push("src/lib/docs-content.ts: retired Arc evaluation document is not excluded from public docs");
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

console.log(`Public production surface guard passed for ${buyerFacingFiles.length} buyer-facing files and legacy-route redirects.`);
