import { afterEach, describe, expect, it, vi } from "vitest";
import { readPrivateB2Object } from "@/lib/b2-private-archive-read.server";

const ENV_KEYS = [
  "B2_S3_ENDPOINT",
  "B2_KEY_ID",
  "B2_APPLICATION_KEY",
  "B2_ARCHIVE_READ_KEY_ID",
  "B2_ARCHIVE_READ_APPLICATION_KEY",
  "B2_ARCHIVE_WRITE_KEY_ID",
  "B2_ARCHIVE_WRITE_APPLICATION_KEY",
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

function setReadCredentials(suffix: string) {
  process.env.B2_S3_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
  process.env.B2_KEY_ID = "write-key";
  process.env.B2_APPLICATION_KEY = "write-secret";
  process.env.B2_ARCHIVE_READ_KEY_ID = `read-key-${suffix}`;
  process.env.B2_ARCHIVE_READ_APPLICATION_KEY = `read-secret-${suffix}`;
  delete process.env.B2_ARCHIVE_WRITE_KEY_ID;
  delete process.env.B2_ARCHIVE_WRITE_APPLICATION_KEY;
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
          namePrefix: "geomacro-evidence/v1/",
        },
      },
    },
  };
}

describe("private B2 archive Native read compatibility", () => {
  it("falls back from denied S3 GET to authorized Native read", async () => {
    setReadCredentials("success");
    const expected = Buffer.from("verified-private-archive");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url === "https://api.backblazeb2.com/b2api/v4/b2_authorize_account") {
          return new Response(JSON.stringify(nativeAuth()), { status: 200 });
        }
        if (url.startsWith("https://f005.backblazeb2.com/file/")) {
          return new Response(expected, { status: 200 });
        }
        if (url.startsWith("https://s3.us-east-005.backblazeb2.com/")) {
          return new Response("<Error><Code>AccessDenied</Code></Error>", { status: 403 });
        }
        throw new Error("unexpected fetch target");
      }),
    );

    await expect(
      readPrivateB2Object("geomacro-evidence/v1/gro/gro_native_test.json.gz"),
    ).resolves.toEqual(expected);
  });

  it("falls back to Native when the S3-compatible read times out", async () => {
    setReadCredentials("timeout");
    const expected = Buffer.from("verified-after-timeout");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url === "https://api.backblazeb2.com/b2api/v4/b2_authorize_account") {
          return new Response(JSON.stringify(nativeAuth()), { status: 200 });
        }
        if (url.startsWith("https://f005.backblazeb2.com/file/")) {
          return new Response(expected, { status: 200 });
        }
        if (url.startsWith("https://s3.us-east-005.backblazeb2.com/")) {
          throw new DOMException("The operation timed out", "TimeoutError");
        }
        throw new Error("unexpected fetch target");
      }),
    );

    await expect(
      readPrivateB2Object(
        "geomacro-evidence/v1/gro/gro_native_timeout.json.gz",
        { timeoutMs: 1_000 },
      ),
    ).resolves.toEqual(expected);
  });

  it("fails closed when Native readFiles capability is absent", async () => {
    setReadCredentials("capability");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url === "https://api.backblazeb2.com/b2api/v4/b2_authorize_account") {
          return new Response(JSON.stringify(nativeAuth(["listFiles"])), { status: 200 });
        }
        if (url.startsWith("https://s3.us-east-005.backblazeb2.com/")) {
          return new Response("<Error><Code>AccessDenied</Code></Error>", { status: 403 });
        }
        throw new Error("unexpected fetch target");
      }),
    );

    await expect(
      readPrivateB2Object("geomacro-evidence/v1/gro/gro_native_capability.json.gz"),
    ).rejects.toThrow("B2_PRIVATE_ARCHIVE_NATIVE_READ_CAPABILITY_MISSING");
  });
});
