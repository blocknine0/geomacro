import { afterEach, describe, expect, it, vi } from "vitest";
import { createB2Client } from "../../scripts/ops/b2-s3-client.mjs";

const KEYS = [
  "B2_ARCHIVE_READ_KEY_ID",
  "B2_ARCHIVE_READ_APPLICATION_KEY",
  "B2_ARCHIVE_WRITE_KEY_ID",
  "B2_ARCHIVE_WRITE_APPLICATION_KEY",
] as const;

const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  vi.unstubAllGlobals();
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


describe("B2 native readback fallback", () => {
  it("uses Backblaze native authenticated download after S3 AccessDenied", async () => {
    clearOptionalReadCredentials();

    const calls = [];
    vi.stubGlobal("fetch", vi.fn(async (input, init = {}) => {
      const url = String(input);
      calls.push({ url, method: init.method ?? "GET" });

      if (url.startsWith("https://s3.us-east-005.backblazeb2.com/")) {
        return new Response("<Error><Code>AccessDenied</Code></Error>", { status: 403 });
      }

      if (url === "https://api.backblazeb2.com/b2api/v4/b2_authorize_account") {
        return Response.json({
          authorizationToken: "native-read-token",
          apiInfo: {
            storageApi: {
              downloadUrl: "https://f005.backblazeb2.com",
              allowed: {
                capabilities: ["readFiles"],
                buckets: [{ name: "geomacro-private-archive" }],
                namePrefix: "geomacro-evidence/v1/",
              },
            },
          },
        });
      }

      if (url === "https://f005.backblazeb2.com/file/geomacro-private-archive/geomacro-evidence/v1/test.json") {
        expect(init.headers?.Authorization).toBe("native-read-token");
        return new Response("verified-native-read", { status: 200 });
      }

      return new Response("unexpected", { status: 500 });
    }));

    const client = createB2Client({
      endpointUrl: "https://s3.us-east-005.backblazeb2.com",
      accessKey: "primary-key",
      secretKey: "primary-secret",
      readAccessKey: "dedicated-key",
      readSecretKey: "dedicated-secret",
      bucket: "geomacro-private-archive",
    });

    const bytes = await client.get("geomacro-evidence/v1/test.json");
    expect(bytes.toString("utf8")).toBe("verified-native-read");
    expect(calls.map((call) => call.url)).toEqual([
      "https://s3.us-east-005.backblazeb2.com/geomacro-private-archive/geomacro-evidence/v1/test.json",
      "https://api.backblazeb2.com/b2api/v4/b2_authorize_account",
      "https://f005.backblazeb2.com/file/geomacro-private-archive/geomacro-evidence/v1/test.json",
    ]);
    expect(client.usage()).toMatchObject({
      native_read_fallback_enabled: true,
      native_read_fallback_attempts: 1,
      native_read_fallback_successes: 1,
    });
  });

  it("fails closed when native credentials lack readFiles", async () => {
    clearOptionalReadCredentials();
    vi.stubGlobal("fetch", vi.fn(async (input) => {
      const url = String(input);
      if (url.startsWith("https://s3.us-east-005.backblazeb2.com/")) {
        return new Response("<Error><Code>AccessDenied</Code></Error>", { status: 403 });
      }
      if (url === "https://api.backblazeb2.com/b2api/v4/b2_authorize_account") {
        return Response.json({
          authorizationToken: "token",
          apiInfo: {
            storageApi: {
              downloadUrl: "https://f005.backblazeb2.com",
              allowed: {
                capabilities: [],
                buckets: [{ name: "geomacro-private-archive" }],
                namePrefix: "geomacro-evidence/v1/",
              },
            },
          },
        });
      }
      return new Response("unexpected", { status: 500 });
    }));

    const client = createB2Client({
      endpointUrl: "https://s3.us-east-005.backblazeb2.com",
      accessKey: "primary-key",
      secretKey: "primary-secret",
      readAccessKey: "dedicated-key",
      readSecretKey: "dedicated-secret",
      bucket: "geomacro-private-archive",
    });

    await expect(client.get("geomacro-evidence/v1/test.json"))
      .rejects.toThrow("B2_NATIVE_READ_CAPABILITY_MISSING");
    expect(client.usage().native_read_fallback_successes).toBe(0);
  });

  it("preserves download_cap_exceeded and stops repeated account-wide read attempts", async () => {
    clearOptionalReadCredentials();
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input) => {
      const url = String(input);
      calls.push(url);

      if (url.startsWith("https://s3.us-east-005.backblazeb2.com/")) {
        return new Response("<Error><Code>AccessDenied</Code></Error>", { status: 403 });
      }
      if (url === "https://api.backblazeb2.com/b2api/v4/b2_authorize_account") {
        return Response.json({
          authorizationToken: "native-read-token",
          apiInfo: {
            storageApi: {
              downloadUrl: "https://f005.backblazeb2.com",
              allowed: {
                capabilities: ["readFiles"],
                buckets: [{ name: "geomacro-private-archive" }],
                namePrefix: "geomacro-evidence/v1/",
              },
            },
          },
        });
      }
      if (url.startsWith("https://f005.backblazeb2.com/file/")) {
        return Response.json(
          { status: 403, code: "download_cap_exceeded", message: "Usage cap exceeded." },
          { status: 403 },
        );
      }
      return new Response("unexpected", { status: 500 });
    }));

    const client = createB2Client({
      endpointUrl: "https://s3.us-east-005.backblazeb2.com",
      accessKey: "primary-key",
      secretKey: "primary-secret",
      readAccessKey: "dedicated-key",
      readSecretKey: "dedicated-secret",
      bucket: "geomacro-private-archive",
    });

    await expect(client.get("geomacro-evidence/v1/first.json"))
      .rejects.toThrow("B2_NATIVE_GET_FAILED_403_download_cap_exceeded");
    expect(calls).toHaveLength(3);

    await expect(client.get("geomacro-evidence/v1/second.json"))
      .rejects.toThrow("B2_NATIVE_GET_FAILED_403_download_cap_exceeded");
    expect(calls).toHaveLength(3);

    expect(client.usage()).toMatchObject({
      native_read_fallback_attempts: 1,
      native_read_fallback_successes: 0,
      native_read_fatal_error: "B2_NATIVE_GET_FAILED_403_download_cap_exceeded",
    });
  });

});
