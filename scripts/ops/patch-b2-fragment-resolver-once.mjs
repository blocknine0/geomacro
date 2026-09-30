#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

const path = "supabase/functions/live-structure-intelligence/index.ts";
let source = readFileSync(path, "utf8");

const replacements = [
  [
    'if (!/^geomacro-evidence\\/v1\\/live\\/v1\\/[A-Za-z0-9_./-]+\\.ndjson\\.gz$/.test(key) ||',
    'if (!/^geomacro-evidence\\/v1\\/(?:live|fragments)\\/v1\\/[A-Za-z0-9_./-]+\\.ndjson\\.gz$/.test(key) ||',
  ],
  [
    '.from(\n          "live_fragment_manifest",\n        )\n        .select(\n          "id,object_path,storage_bucket,compressed_sha256,item_count,source_key,stream_key,period_end,verified_at",\n        )',
    '.from(\n          "resolved_live_fragment_locations",\n        )\n        .select(\n          "id,object_path:resolved_object_path,storage_bucket:resolved_storage_bucket,compressed_sha256,item_count,source_key,stream_key,period_end,verified_at",\n        )',
  ],
  [
    '.from(\n          "live_fragment_manifest",\n        )\n        .select(\n          "id,object_path,storage_bucket,compressed_sha256,item_count,period_end,verified_at",\n        )',
    '.from(\n          "resolved_live_fragment_locations",\n        )\n        .select(\n          "id,object_path:resolved_object_path,storage_bucket:resolved_storage_bucket,compressed_sha256,item_count,period_end,verified_at",\n        )',
  ],
];

let changed = 0;
for (const [before, after] of replacements) {
  if (source.includes(after)) continue;
  const occurrences = source.split(before).length - 1;
  if (occurrences !== 1) {
    throw new Error(`Resolver patch guard failed: expected exactly one old block, found ${occurrences}`);
  }
  source = source.replace(before, after);
  changed += 1;
}

if (!source.includes('"resolved_live_fragment_locations"') ||
    !source.includes('object_path:resolved_object_path') ||
    !source.includes('storage_bucket:resolved_storage_bucket') ||
    !source.includes('(?:live|fragments)\\/v1')) {
  throw new Error("Resolver patch verification failed");
}

if (changed > 0) writeFileSync(path, source);
console.log(JSON.stringify({ ok: true, changed }));
