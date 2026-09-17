import { spawnSync } from "node:child_process";
import fs from "node:fs";

const runtimePath = "supabase/functions/live-structure-intelligence/index.ts";
const original = fs.readFileSync(runtimePath, "utf8");

try {
  const result = spawnSync(
    process.execPath,
    ["scripts/patch-live-structure-private-error-serializer.mjs"],
    { encoding: "utf8" },
  );

  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    process.exit(result.status ?? 1);
  }

  const patched = fs.readFileSync(runtimePath, "utf8");
  const required = [
    '"canonical_story_lookup"',
    '"story_key"',
    ".maybeSingle()",
    "canonicalStory.id",
    'phase=${phase}',
  ];

  for (const marker of required) {
    if (!patched.includes(marker)) {
      throw new Error(`Patched live structuring runtime is missing ${marker}`);
    }
  }

  const randomIdIndex = patched.indexOf("crypto.randomUUID()", patched.indexOf('"canonical_story_lookup"'));
  const canonicalLookupIndex = patched.indexOf('"canonical_story_lookup"');
  if (randomIdIndex < canonicalLookupIndex) {
    throw new Error("A replacement event id can be allocated before canonical story lookup.");
  }

  console.log("PASS: stable canonical live-event identity patch applies cleanly.");
} finally {
  fs.writeFileSync(runtimePath, original, "utf8");
}
