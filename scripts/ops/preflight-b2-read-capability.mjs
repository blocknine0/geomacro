#!/usr/bin/env node
import { createB2Client } from "./b2-s3-client.mjs";

const ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
const BUCKET = "geomacro-private-archive";
const PROBE_KEY =
  "geomacro-evidence/v1/live/_capability/read-only-probe-never-created.json";

if (
  String(process.env.B2_S3_ENDPOINT ?? ENDPOINT).trim() !== ENDPOINT ||
  !process.env.B2_KEY_ID ||
  !process.env.B2_APPLICATION_KEY
) {
  throw new Error("B2_READ_PREFLIGHT_CONFIG_REQUIRED");
}

const b2 = createB2Client({
  endpointUrl: ENDPOINT,
  accessKey: process.env.B2_KEY_ID,
  secretKey: process.env.B2_APPLICATION_KEY,
  readAccessKey: process.env.B2_ARCHIVE_READ_KEY_ID,
  readSecretKey: process.env.B2_ARCHIVE_READ_APPLICATION_KEY,
  bucket: BUCKET,
});

const value = await b2.getOptional(PROBE_KEY);
if (value !== null) {
  throw new Error("B2_READ_PREFLIGHT_PROBE_KEY_MUST_NOT_EXIST");
}

const usage = b2.usage();
process.stdout.write(
  JSON.stringify({
    ok: true,
    schema: "geomacro.b2-read-capability-preflight.v1",
    probe_key: PROBE_KEY,
    missing_probe_accepted: true,
    read_credentials_separate: usage.read_credentials_separate,
    read_credential_roles: usage.read_credential_roles,
    native_read_fallback_enabled: usage.native_read_fallback_enabled,
    requests_started: usage.requests_started,
    b2_write_performed: false,
    destructive_b2_change: false,
    payment_performed: false,
    execution_authorized: false,
  }) + "\n",
);
