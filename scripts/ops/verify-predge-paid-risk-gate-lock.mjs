#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function verifyPredgePaidRiskGateLock({ root = process.cwd() } = {}) {
  const lockPath = resolve(root, "config/predge-paid-risk-gate-lock.v1.json");
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  if (lock?.schema !== "geomacro.predge-paid-risk-gate-lock.v1") {
    throw new Error("PREDGE_PAID_RISK_GATE_LOCK_SCHEMA_INVALID");
  }
  if (lock.locked !== true) {
    throw new Error("PREDGE_PAID_RISK_GATE_LOCK_MUST_BE_ACTIVE");
  }
  const entries = Object.entries(lock.files ?? {});
  if (entries.length < 7) {
    throw new Error("PREDGE_PAID_RISK_GATE_LOCK_INCOMPLETE");
  }
  const mismatches = [];
  for (const [relPath, expectedSha] of entries) {
    const actualSha = createHash("sha256").update(readFileSync(resolve(root, relPath))).digest("hex");
    if (actualSha !== expectedSha) {
      mismatches.push({ path: relPath, expected: expectedSha, actual: actualSha });
    }
  }
  if (mismatches.length > 0) {
    const err = new Error(`PREDGE_PAID_RISK_GATE_LOCK_VIOLATION: ${mismatches.map(m => m.path).join(", ")}`);
    err.mismatches = mismatches;
    throw err;
  }
  return { ok: true, locked: true, verified_files: entries.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const res = verifyPredgePaidRiskGateLock();
  console.log(JSON.stringify(res));
}
