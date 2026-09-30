#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, found ${count}`);
  return source.replace(before, after);
}

const riskPath = "src/lib/global-risk-read.server.ts";
let risk = readFileSync(riskPath, "utf8");
risk = replaceOnce(
  risk,
  'import { getAppSupabase } from "./supabase-app.server";\n',
  'import { getAppSupabase } from "./supabase-app.server";\nimport { readB2PublicRisk } from "./b2-live.server";\n',
  "b2 import",
);
risk = replaceOnce(
  risk,
  'export async function readPublicGlobalRisk(): Promise<GlobalRisk> {\n  const supabase = getAppSupabase();\n  if (!supabase) throw new Error("Risk index store unavailable");\n',
  'async function readVerifiedB2GlobalRiskOrThrow(reason: string): Promise<GlobalRisk> {\n  const b2 = await readB2PublicRisk();\n  if (b2) {\n    console.warn(`[public-gri] ${reason}; serving verified B2 snapshot`);\n    return b2;\n  }\n  throw new Error(reason);\n}\n\nexport async function readPublicGlobalRisk(): Promise<GlobalRisk> {\n  const supabase = getAppSupabase();\n  if (!supabase) return readVerifiedB2GlobalRiskOrThrow("Risk index store unavailable");\n',
  "missing Supabase fallback",
);
risk = replaceOnce(
  risk,
  '  if (snapshotResult.error) {\n    console.error("[public-gri] canonical snapshot read failed", snapshotResult.error.message);\n    throw new Error("Unable to load the canonical Global Risk Index");\n  }\n  if (!snapshotResult.data?.length) {\n    throw new Error("No published verified snapshot exists for the current GRI methodology");\n  }\n',
  '  if (snapshotResult.error) {\n    console.error("[public-gri] canonical snapshot read failed", snapshotResult.error.message);\n    return readVerifiedB2GlobalRiskOrThrow("Unable to load the canonical Global Risk Index");\n  }\n  if (!snapshotResult.data?.length) {\n    return readVerifiedB2GlobalRiskOrThrow("No published verified snapshot exists for the current GRI methodology");\n  }\n',
  "query fallback",
);
writeFileSync(riskPath, risk);

const testPath = "src/__tests__/b2-live-read-boundary.test.ts";
let test = readFileSync(testPath, "utf8");
const marker = '  it("publishes only after B2 write/readback verification and never deletes database history", () => {';
const block = `  it("keeps the direct canonical GRI reader available from verified B2 when Supabase is unavailable", () => {\n    const source = read("src/lib/global-risk-read.server.ts");\n    expect(source).toContain('import { readB2PublicRisk } from "./b2-live.server"');\n    expect(source).toContain('if (!supabase) return readVerifiedB2GlobalRiskOrThrow("Risk index store unavailable")');\n    expect(source).toContain('return readVerifiedB2GlobalRiskOrThrow("Unable to load the canonical Global Risk Index")');\n    expect(source).toContain("serving verified B2 snapshot");\n  });\n\n`;
if (!test.includes("keeps the direct canonical GRI reader available from verified B2")) {
  test = replaceOnce(test, marker, block + marker, "B2 direct-risk test");
}
writeFileSync(testPath, test);

for (const required of [
  "readVerifiedB2GlobalRiskOrThrow",
  "readB2PublicRisk",
  "serving verified B2 snapshot",
]) {
  if (!risk.includes(required)) throw new Error(`missing risk fallback marker: ${required}`);
}
console.log(JSON.stringify({ ok: true }));
