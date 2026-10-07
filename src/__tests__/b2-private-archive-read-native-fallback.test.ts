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

const original = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);

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
  it("falls back from denied S3 GET to authorized Native read and then prefers Native", async () => {
    setReadCredentials("success");
    const expected = Buffer.from("verified-private-archive");
    const calls: string[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push(url);

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
          return new Response("<Error><Code>AccessDenied</Code></Error>", {
            status: 403,
          });
        }
        throw new Error("unexpected fetch target");
      }),
    );

    const first = await readPrivateB2Object(
      "geomacro-evidence/v1/gro/gro_native_test_a.json.gz",
    );
    const second = await readPrivateB2Object(
      "geomacro-evidence/v1/gro/gro_native_test_b.json.gz",
    );

    expect(first).toEqual(expected);
    expect(second).toEqual(expected);
    expect(
      calls.filter((url) =>
        url.startsWith("https://s3.us-east-005.backblazeb2.com/"),
      ),
    ).toHaveLength(1);
    expect(
      calls.filter(
        (url) =>
          url ===
          "https://api.backblazeb2.com/b2api/v4/b2_authorize_account",
      ),
    ).toHaveLength(1);
    expect(
      calls.filter((url) =>
        url.startsWith("https://f005.backblazeb2.com/file/"),
      ),
    ).toHaveLength(2);
  });

  it("fails closed when the Native credential lacks readFiles", async () => {
    setReadCredentials("capability");

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
          return new Response("<Error><Code>AccessDenied</Code></Error>", {
            status: 403,
          });
        }
        throw new Error("unexpected fetch target");
      }),
    );

    await expect(
      readPrivateB2Object(
        "geomacro-evidence/v1/gro/gro_native_capability.json.gz",
      ),
    ).rejects.toThrow("B2_PRIVATE_ARCHIVE_NATIVE_READ_CAPABILITY_MISSING");
  });

  it("rejects an untrusted Native download host", async () => {
    setReadCredentials("host");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url === "https://api.backblazeb2.com/b2api/v4/b2_authorize_account") {
          const payload = nativeAuth();
          payload.apiInfo.storageApi.downloadUrl = "https://attacker.example";
          return new Response(JSON.stringify(payload), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (url.startsWith("https://s3.us-east-005.backblazeb2.com/")) {
          return new Response("<Error><Code>AccessDenied</Code></Error>", {
            status: 403,
          });
        }
        throw new Error("unexpected fetch target");
      }),
    );

    await expect(
      readPrivateB2Object(
        "geomacro-evidence/v1/gro/gro_native_bad_host.json.gz",
      ),
    ).rejects.toThrow("B2_PRIVATE_ARCHIVE_NATIVE_DOWNLOAD_URL_INVALID");
  });
});
