import { afterEach, describe, expect, it, vi } from "vitest";
import { readPrivateB2Object } from "../lib/b2-private-archive-read.server";

const KEYS = [
  "B2_ARCHIVE_READ_KEY_ID",
  "B2_ARCHIVE_READ_APPLICATION_KEY",
  "B2_ARCHIVE_WRITE_KEY_ID",
  "B2_ARCHIVE_WRITE_APPLICATION_KEY",
  "B2_KEY_ID",
  "B2_APPLICATION_KEY",
  "B2_S3_ENDPOINT",
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

function setReadCredentials() {
  for (const key of KEYS) delete process.env[key];
  process.env.B2_ARCHIVE_READ_KEY_ID = "read-key";
  process.env.B2_ARCHIVE_READ_APPLICATION_KEY = "read-secret";
  process.env.B2_S3_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
}

describe("private B2 server native fallback", () => {
  it("falls back from exact S3 AccessDenied to scoped native authenticated download", async () => {
    setReadCredentials();
    vi.stubGlobal("fetch", vi.fn(async (input, init = {}) => {
      const url = String(input);
      if (url.startsWith("https://s3.us-east-005.backblazeb2.com/")) {
        return new Response("<Error><Code>AccessDenied</Code></Error>", { status: 403 });
      }
      if (url === "https://api.backblazeb2.com/b2api/v4/b2_authorize_account") {
        expect(String(init.headers?.Authorization ?? "")).toMatch(/^Basic /);
        return Response.json({
          authorizationToken: "native-token",
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
        expect(init.headers?.Authorization).toBe("native-token");
        return new Response("native-private-read", { status: 200 });
      }
      return new Response("unexpected", { status: 500 });
    }));

    const bytes = await readPrivateB2Object("geomacro-evidence/v1/test.json", { maxBytes: 1024 });
    expect(bytes.toString("utf8")).toBe("native-private-read");
  });

  it("rejects native authorization without readFiles capability", async () => {
    setReadCredentials();
    vi.stubGlobal("fetch", vi.fn(async (input) => {
      const url = String(input);
      if (url.startsWith("https://s3.us-east-005.backblazeb2.com/")) {
        return new Response("<Error><Code>AccessDenied</Code></Error>", { status: 403 });
      }
      if (url === "https://api.backblazeb2.com/b2api/v4/b2_authorize_account") {
        return Response.json({
          authorizationToken: "native-token",
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

    await expect(readPrivateB2Object("geomacro-evidence/v1/test.json"))
      .rejects.toThrow("B2_PRIVATE_NATIVE_READ_CAPABILITY_MISSING");
  });
  it("stops on native download cap instead of trying another credential", async () => {
    setReadCredentials();
    process.env.B2_KEY_ID = "primary-key";
    process.env.B2_APPLICATION_KEY = "primary-secret";
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.startsWith("https://s3.us-east-005.backblazeb2.com/")) {
        return new Response("<Error><Code>AccessDenied</Code></Error>", { status: 403 });
      }
      if (url === "https://api.backblazeb2.com/b2api/v4/b2_authorize_account") {
        return Response.json({
          authorizationToken: "native-token",
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

    await expect(readPrivateB2Object("geomacro-evidence/v1/test.json"))
      .rejects.toThrow("B2_DOWNLOAD_CAP_EXCEEDED");
    expect(calls.filter((url) => url.startsWith("https://s3.us-east-005.backblazeb2.com/"))).toHaveLength(1);
  });
});
