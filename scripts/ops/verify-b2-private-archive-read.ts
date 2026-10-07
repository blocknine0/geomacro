#!/usr/bin/env bun
import { createHash } from "node:crypto";
import {
  b2PrivateArchiveReadConfigured,
  readPrivateB2Object,
} from "../../src/lib/b2-private-archive-read.server";

const PROOF_KEY = "geomacro-evidence/v1/live/country-gro/continuity-proof.json";
const PROOF_SCHEMA = "geomacro.country-gro-continuity-proof.v1";
const SOURCE_PROJECT = "ldpwajisioljyjtojvfx";

const sha256 = (value: Uint8Array) =>
  createHash("sha256").update(value).digest("hex");

if (
  !process.env.B2_ARCHIVE_READ_KEY_ID ||
  !process.env.B2_ARCHIVE_READ_APPLICATION_KEY ||
  !b2PrivateArchiveReadConfigured()
) {
  throw new Error("B2_PRIVATE_ARCHIVE_DEDICATED_READ_CONFIG_REQUIRED");
}

const bytes = await readPrivateB2Object(PROOF_KEY, {
  timeoutMs: 20_000,
  maxBytes: 2_000_000,
});

const proof = JSON.parse(bytes.toString("utf8"));
if (
  proof?.schema !== PROOF_SCHEMA ||
  proof?.source_project !== SOURCE_PROJECT ||
  !Array.isArray(proof?.entries) ||
  proof.entries.length < 2 ||
  Number(proof?.countries_published ?? 0) < 1
) {
  throw new Error("B2_PRIVATE_ARCHIVE_READ_PROOF_INVALID");
}

console.log(JSON.stringify({
  ok: true,
  schema: "geomacro.b2-private-archive-runtime-read-proof.v1",
  key: PROOF_KEY,
  bytes: bytes.length,
  sha256: sha256(bytes),
  entries: proof.entries.length,
  countries_published: Number(proof.countries_published),
  dedicated_read_credentials: true,
  raw_data_delivered: false,
  destructive_b2_change: false,
  payment_performed: false,
  execution_authorized: false,
}));
