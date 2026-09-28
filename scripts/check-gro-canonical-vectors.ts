/**
 * Cross-implementation check for geomacro-canonical-json-v1: the repo's own canonicalizers (the signing path's
 * canonicalRiskObjectJson and src/lib/canonical-json.ts) must reproduce the committed edge vector byte for byte.
 * The independent Python implementation (verifiers/python/verify_gro.py) checks the same vector in the workflow,
 * so a divergence in either runtime fails CI. Vector: test-vectors/gro-canonical-json-v1-edge-vectors.json.
 */
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { canonicalRiskObjectJson } from "../src/lib/risk-object-signing.server.ts";
import { canonicalJson } from "../src/lib/canonical-json.ts";

const files = readdirSync("test-vectors").filter((f) => /^gro-canonical-json-v1-.*\.json$/.test(f)).sort();
if (files.length === 0) throw new Error("no gro-canonical-json-v1-*.json vectors found");
const out: Record<string, unknown> = {};
let ok = true;
for (const f of files) {
  const v = JSON.parse(readFileSync(`test-vectors/${f}`, "utf8"));
  const input = JSON.parse(v.input_json_text);
  const results: Record<string, { canonical_matches: boolean; sha256_matches: boolean; sha256: string }> = {};
  for (const [name, fn] of [["canonicalRiskObjectJson", canonicalRiskObjectJson], ["canonicalJson", canonicalJson]] as const) {
    const got = fn(input);
    const sha = createHash("sha256").update(got, "utf8").digest("hex");
    results[name] = { canonical_matches: got === v.canonical_json, sha256_matches: sha === v.canonical_sha256, sha256: sha };
  }
  const fileOk = Object.values(results).every((r) => r.canonical_matches && r.sha256_matches);
  ok = ok && fileOk;
  out[f] = { ok: fileOk, expected_sha256: v.canonical_sha256, results };
}
console.log(JSON.stringify({ ok, vectors: out }, null, 1));
if (!ok) process.exit(1);
