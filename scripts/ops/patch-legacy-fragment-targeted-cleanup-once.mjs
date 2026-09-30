#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
const path = "scripts/ops/b2-fragment-targeted-cleanup.mjs";
let source = readFileSync(path, "utf8");
const before = '!/^live\\/v1\\/[A-Za-z0-9_./-]+\\.ndjson\\.gz$/.test(sourcePath)';
const after = '!/^(?:live|fragments)\\/v1\\/[A-Za-z0-9_./-]+\\.ndjson\\.gz$/.test(sourcePath)';
if (!source.includes(after)) {
  const n = source.split(before).length - 1;
  if (n !== 1) throw new Error(`Expected one legacy path guard, found ${n}`);
  source = source.replace(before, after);
  writeFileSync(path, source);
}
if (!source.includes('(?:live|fragments)\\/v1')) throw new Error("Legacy fragment path guard patch failed");
console.log(JSON.stringify({ok:true}));
