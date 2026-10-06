import { afterEach, describe, expect, it, vi } from "vitest";
import { createB2Client } from "../../scripts/ops/b2-s3-client.mjs";

const ENV_KEYS = [
  "B2_ARCHIVE_READ_KEY_ID",
  "B2_ARCHIVE_READ_APPLICATION_KEY",
  "B2_ARCHIVE_WRITE_KEY_ID",
  "B2_ARCHIVE_WRITE_APPLICATION_KEY",
  "B2_REQUEST_BUDGET",
] as const;

const original = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of ENV_KEYS) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function cleanEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}

function client() {
  return createB2Client({
    endpointUrl: "https://s3.us-east-005.backblazeb2.com",
    accessKey: "write-key",
    secretKey: "write-secret",
    readAccessKey: "read-key",
    readSecretKey: "read-secret",
    bucket: "geomacro-private-archive",
  });
}

function nativeAuth(capabilities = ["readFiles"]) {
  return {
    authorizationToken: "native-token",
    apiInfo: {
      storageApi: {
        downloadUrl: "https://f005.backblazeb2.com",
        allowed: {
          buckets: [{ id: "bucket-id", name: "geomacro-private-archive" }],
          capabilities,
          namePrefix: null,
        },
      },
    },
  };
}

describe("B2 native read fallback", () => {
  it("uses the Native API when S3 GET is denied for a dedicated read key", async () => {
    cleanEnv();
    const expected = Buffer.from("verified-readback");
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://api.backblazeb2.com/b2api/v4/b2_authorize_account") {
        return new Response(JSON.stringify(nativeAuth()), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.startsWith("https://f005.backblazeb2.com/file/")) {
        expect(init?.headers).toEqual({ Authorization: "native-token" });
        return new Response(expected, { status: 200 });
      }
      if (url.startsWith("https://s3.us-east-005.backblazeb2.com/")) {
        return new Response("<Error><Code>AccessDenied</Code></Error>", { status: 403 });
      }
      throw new Error("unexpected fetch target");
    });
    vi.stubGlobal("fetch", fetchMock);

    const b2 = client();
    await expect(
      b2.get("geomacro-evidence/v1/live/native-fallback-test.bin"),
    ).resolves.toEqual(expected);

    expect(b2.usage()).toMatchObject({
      native_read_fallback_enabled: true,
      native_read_fallback_attempts: 1,
      native_read_fallback_successes: 1,
      requests_started: 3,
    });
  });

  it("fails closed when the Native API credential lacks readFiles", async () => {
    cleanEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url === "https://api.backblazeb2.com/b2api/v4/b2_authorize_account") {
          return new Response(JSON.stringify(nativeAuth(["listFiles"])), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.startsWith("https://s3.us-east-005.backblazeb2.com/")) {
          return new Response("<Error><Code>AccessDenied</Code></Error>", { status: 403 });
        }
        throw new Error("unexpected fetch target");
      }),
    );

    await expect(
      client().get("geomacro-evidence/v1/live/native-fallback-test.bin"),
    ).rejects.toThrow("B2_NATIVE_READ_CAPABILITY_MISSING");
  });

  it("preserves optional-not-found semantics through the Native API", async () => {
    cleanEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url === "https://api.backblazeb2.com/b2api/v4/b2_authorize_account") {
          return new Response(JSON.stringify(nativeAuth()), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.startsWith("https://f005.backblazeb2.com/file/")) {
          return new Response(JSON.stringify({ code: "not_found", status: 404 }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.startsWith("https://s3.us-east-005.backblazeb2.com/")) {
          return new Response("<Error><Code>AccessDenied</Code></Error>", { status: 403 });
        }
        throw new Error("unexpected fetch target");
      }),
    );

    await expect(
      client().getOptional("geomacro-evidence/v1/live/native-fallback-missing.bin"),
    ).resolves.toBeNull();
  });
});
