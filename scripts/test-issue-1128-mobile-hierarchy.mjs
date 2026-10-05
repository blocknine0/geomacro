#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const files = {
  liquidity: "src/components/sections/liquidity-section.tsx",
  bridge: "src/components/sections/bridge-section.tsx",
  swap: "src/components/sections/swap-section.tsx",
  intelligence: "src/routes/intelligence.tsx",
  demo: "src/routes/demo.tsx",
};

const source = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")])));
const checks = [
  ["liquidity uses mobile-first gutters", source.liquidity.includes('px-4 py-12 sm:px-6 sm:py-16')],
  ["liquidity mobile heading is reduced without changing desktop", source.liquidity.includes('text-2xl tracking-tight sm:text-3xl')],
  ["bridge card uses mobile-first padding", source.bridge.includes('p-4 sm:space-y-6 sm:p-6')],
  ["bridge wallet stacks on mobile", source.bridge.includes('flex flex-col gap-3') && source.bridge.includes('sm:flex-row')],
  ["bridge long wallet identifiers wrap", source.bridge.includes('break-all text-xs text-muted-foreground')],
  ["bridge result rows avoid forced horizontal layout", source.bridge.includes('grid min-w-0 gap-1 sm:grid-cols-[minmax(0,1fr)_auto]')],
  ["swap retains narrow-screen wrapping for status controls", source.swap.includes('flex flex-wrap gap-2')],
  ["intelligence uses mobile-first page gutters", source.intelligence.includes('px-4 py-8 sm:px-6')],
  ["intelligence cards are single-column before md", source.intelligence.includes('grid gap-4 md:grid-cols-2')],
  ["demo machine response wraps long content", source.demo.includes('whitespace-pre-wrap break-words')],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
if (failed.length) {
  console.error(`\n#1128 mobile hierarchy regression guard failed: ${failed.length} check(s).`);
  process.exit(1);
}
console.log("\n#1128 mobile hierarchy regression guard passed.");
