#!/usr/bin/env bun
import { spawnSync } from "node:child_process";

const activeKeyId = String(process.env.RISK_OBJECT_SIGNING_KEY_ID ?? "").trim();
const suffix = String(process.env.GRO_ARCHIVE_SUFFIX ?? "").trim().toLowerCase();
const rounds = Number(process.env.GRO_RETIRED_KEY_ROUNDS ?? 4);
if (!activeKeyId || !/^[0-9a-f]$/.test(suffix) || !Number.isInteger(rounds) || rounds < 1 || rounds > 20) {
  throw new Error("GRO_RETIRED_KEY_ARCHIVE_CONFIG_INVALID");
}

const response = await fetch("https://geomacro.live/api/risk-object-keys", {
  signal: AbortSignal.timeout(15_000),
});
if (!response.ok) throw new Error("GRO_RETIRED_KEY_REGISTRY_UNAVAILABLE");
const body = await response.json() as {
  keys?: Array<{ key_id: string; status: "active" | "retired" | "revoked" }>;
};

const retiredKeyIds = (body.keys ?? [])
  .filter((key) => key.status === "retired" && key.key_id !== activeKeyId)
  .map((key) => key.key_id)
  .sort();

for (const keyId of retiredKeyIds) {
  for (let round = 1; round <= rounds; round++) {
    console.log(`Retired-key GRO archive round ${round}/${rounds} for ${keyId} shard ${suffix}`);
    const run = spawnSync("bun", ["scripts/ops/b2-archive-gro-bundle.ts"], {
      env: { ...process.env, RISK_OBJECT_SIGNING_KEY_ID: keyId },
      encoding: "utf8",
    });
    const stdout = run.stdout ?? "";
    const stderr = run.stderr ?? "";
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
    if ((run.status ?? 1) !== 0) {
      const combined = `${stdout}\n${stderr}`;
      if (/57014|statement timeout|canceling statement due to statement timeout/i.test(combined)) {
        console.log(`Persistent free-tier pressure while archiving retired key ${keyId}; pausing this key for the cycle.`);
        break;
      }
      throw new Error(`GRO_RETIRED_KEY_ARCHIVE_FAILED_${keyId}`);
    }
    if (stdout.includes('"status":"complete"')) break;
  }
}

console.log(JSON.stringify({
  ok: true,
  status: "complete",
  shard_suffix: suffix,
  retired_keys_considered: retiredKeyIds,
  revoked_keys_excluded: true,
}));
