import { afterEach, describe, expect, it } from "vitest";
import { createB2Client } from "../../scripts/ops/b2-s3-client.mjs";

const KEYS = [
  "B2_ARCHIVE_READ_KEY_ID",
  "B2_ARCHIVE_READ_APPLICATION_KEY",
  "B2_ARCHIVE_WRITE_KEY_ID",
  "B2_ARCHIVE_WRITE_APPLICATION_KEY",
] as const;

const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of KEYS) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function clearOptionalReadCredentials() {
  for (const key of KEYS) delete process.env[key];
}

describe("B2 client read fallback usage metadata", () => {
  it("reports no primary fallback when primary is the only read credential", () => {
    clearOptionalReadCredentials();
    const client = createB2Client({
      endpointUrl: "https://s3.us-east-005.backblazeb2.com",
      accessKey: "primary-key",
      secretKey: "primary-secret",
      bucket: "geomacro-private-archive",
    });

    expect(client.usage().read_credential_roles).toEqual(["primary"]);
    expect(client.usage().read_fallback_to_primary_available).toBe(false);
  });

  it("reports primary fallback when a distinct read credential precedes primary", () => {
    clearOptionalReadCredentials();
    const client = createB2Client({
      endpointUrl: "https://s3.us-east-005.backblazeb2.com",
      accessKey: "primary-key",
      secretKey: "primary-secret",
      readAccessKey: "dedicated-key",
      readSecretKey: "dedicated-secret",
      bucket: "geomacro-private-archive",
    });

    expect(client.usage().read_credential_roles).toEqual([
      "explicit-read",
      "primary",
    ]);
    expect(client.usage().read_fallback_to_primary_available).toBe(true);
  });

  it("does not invent a fallback when an explicit read pair deduplicates to primary", () => {
    clearOptionalReadCredentials();
    const client = createB2Client({
      endpointUrl: "https://s3.us-east-005.backblazeb2.com",
      accessKey: "same-key",
      secretKey: "same-secret",
      readAccessKey: "same-key",
      readSecretKey: "same-secret",
      bucket: "geomacro-private-archive",
    });

    expect(client.usage().read_credential_roles).toEqual(["explicit-read"]);
    expect(client.usage().read_fallback_to_primary_available).toBe(false);
  });
});
