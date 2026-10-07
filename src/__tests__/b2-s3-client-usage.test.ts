import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createB2Client } from "../../scripts/ops/b2-s3-client.mjs";

const KEYS = [
  "B2_ARCHIVE_READ_KEY_ID",
  "B2_ARCHIVE_READ_APPLICATION_KEY",
  "B2_ARCHIVE_WRITE_KEY_ID",
  "B2_ARCHIVE_WRITE_APPLICATION_KEY",
  "B2_REQUEST_BUDGET",
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
  it("uses a conservative default request budget when a workflow omits one", () => {
    clearOptionalReadCredentials();
    delete process.env.B2_REQUEST_BUDGET;
    const client = createB2Client({
      endpointUrl: "https://s3.us-east-005.backblazeb2.com",
      accessKey: "primary-key",
      secretKey: "primary-secret",
      bucket: "geomacro-private-archive",
    });

    expect(client.usage()).toMatchObject({
      request_budget: 64,
      default_request_budget: 64,
      max_request_budget: 500,
      requests_started: 0,
    });
  });

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


  it("sticks to the proven native read path after the first S3 AccessDenied", async () => {
    clearOptionalReadCredentials();
    process.env.B2_REQUEST_BUDGET = "8";
    const calls: string[] = [];

    vi.stubGlobal("fetch", vi.fn(async (input, init = {}) => {
      const url = String(input);
      calls.push(url);

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
                capabilities: ["readFiles"],
                buckets: [{ name: "geomacro-private-archive" }],
                namePrefix: "geomacro-evidence/v1/",
              },
            },
          },
        });
      }
      if (url.startsWith("https://f005.backblazeb2.com/file/")) {
        return new Response(url.endsWith("first.json") ? "first" : "second", { status: 200 });
      }
      return new Response("unexpected", { status: 500 });
    }));

    const client = createB2Client({
      endpointUrl: "https://s3.us-east-005.backblazeb2.com",
      accessKey: "primary-key",
      secretKey: "primary-secret",
      bucket: "geomacro-private-archive",
    });

    expect((await client.get("geomacro-evidence/v1/first.json")).toString()).toBe("first");
    expect((await client.get("geomacro-evidence/v1/second.json")).toString()).toBe("second");

    expect(calls.filter((url) => url.startsWith("https://s3.us-east-005.backblazeb2.com/"))).toHaveLength(1);
    expect(calls.filter((url) => url.includes("b2_authorize_account"))).toHaveLength(1);
    expect(calls.filter((url) => url.startsWith("https://f005.backblazeb2.com/file/"))).toHaveLength(2);
    expect(client.usage()).toMatchObject({
      requests_started: 3,
      s3_requests_started: 1,
      native_read_requests_started: 2,
      native_preferred_credential_count: 1,
    });
  });

  it("counts native fallback reads inside the same hard request budget", async () => {
    clearOptionalReadCredentials();
    process.env.B2_REQUEST_BUDGET = "2";
    const calls: string[] = [];

    vi.stubGlobal("fetch", vi.fn(async (input) => {
      const url = String(input);
      calls.push(url);
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
                capabilities: ["readFiles"],
                buckets: [{ name: "geomacro-private-archive" }],
                namePrefix: "geomacro-evidence/v1/",
              },
            },
          },
        });
      }
      if (url.startsWith("https://f005.backblazeb2.com/file/")) {
        return new Response("verified", { status: 200 });
      }
      return new Response("unexpected", { status: 500 });
    }));

    const client = createB2Client({
      endpointUrl: "https://s3.us-east-005.backblazeb2.com",
      accessKey: "primary-key",
      secretKey: "primary-secret",
      bucket: "geomacro-private-archive",
    });

    await expect(client.get("geomacro-evidence/v1/first.json")).resolves.toBeInstanceOf(Buffer);
    const callsAfterFirstRead = calls.length;
    await expect(client.get("geomacro-evidence/v1/second.json"))
      .rejects.toThrow("B2_REQUEST_BUDGET_EXHAUSTED");
    expect(calls).toHaveLength(callsAfterFirstRead);
    expect(client.usage()).toMatchObject({
      requests_started: 2,
      request_budget: 2,
      s3_requests_started: 1,
      native_read_requests_started: 1,
    });
  });

  it("single-flights concurrent reads of the same required key", async () => {
    clearOptionalReadCredentials();
    process.env.B2_REQUEST_BUDGET = "4";
    let nativeDownloads = 0;

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
                capabilities: ["readFiles"],
                buckets: [{ name: "geomacro-private-archive" }],
                namePrefix: "geomacro-evidence/v1/",
              },
            },
          },
        });
      }
      if (url.startsWith("https://f005.backblazeb2.com/file/")) {
        nativeDownloads += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return new Response("same-bytes", { status: 200 });
      }
      return new Response("unexpected", { status: 500 });
    }));

    const client = createB2Client({
      endpointUrl: "https://s3.us-east-005.backblazeb2.com",
      accessKey: "primary-key",
      secretKey: "primary-secret",
      bucket: "geomacro-private-archive",
    });

    const [a, b] = await Promise.all([
      client.get("geomacro-evidence/v1/same.json"),
      client.get("geomacro-evidence/v1/same.json"),
    ]);
    expect(a.toString()).toBe("same-bytes");
    expect(b.toString()).toBe("same-bytes");
    expect(nativeDownloads).toBe(1);
    expect(client.usage().requests_started).toBe(2);
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
});


describe("B2 hard cap handling", () => {
  it("stops immediately on native download_cap_exceeded without rotating credentials", async () => {
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
          authorizationToken: "token",
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

    await expect(client.get("geomacro-evidence/v1/test.json"))
      .rejects.toThrow("B2_DOWNLOAD_CAP_EXCEEDED");
    expect(calls.filter((url) => url.includes("b2_authorize_account"))).toHaveLength(1);
    expect(calls.filter((url) => url.startsWith("https://f005.backblazeb2.com/file/"))).toHaveLength(1);
    expect(calls.filter((url) => url.startsWith("https://s3.us-east-005.backblazeb2.com/"))).toHaveLength(1);

    const callsAfterFirstFailure = calls.length;
    await expect(client.get("geomacro-evidence/v1/second.json"))
      .rejects.toThrow("B2_DOWNLOAD_CAP_EXCEEDED");
    expect(calls).toHaveLength(callsAfterFirstFailure);
    expect(client.usage().native_read_fatal_error).toBe("B2_DOWNLOAD_CAP_EXCEEDED");
  });
});


describe("B2 signed PUT plus full readback verification", () => {
  it("verifies stored bytes with the same single Class-B verification operation", async () => {
    clearOptionalReadCredentials();
    process.env.B2_REQUEST_BUDGET = "4";

    const body = Buffer.from("fresh-phase-a-evidence", "utf8");
    const digest = createHash("sha256").update(body).digest("hex");
    const methods: string[] = [];

    vi.stubGlobal("fetch", vi.fn(async (_input, init = {}) => {
      const method = String(init.method ?? "GET");
      methods.push(method);
      const headers = init.headers as Record<string, string>;

      if (method === "PUT") {
        expect(headers["x-amz-meta-geomacro-sha256"]).toBe(digest);
        expect(headers.Authorization).toContain("x-amz-meta-geomacro-sha256");
        expect(init.body).toStrictEqual(body);
        return new Response(null, { status: 200 });
      }

      if (method === "GET") {
        expect(init.body).toBeUndefined();
        return new Response(body, { status: 200 });
      }

      return new Response("unexpected", { status: 500 });
    }));

    const client = createB2Client({
      endpointUrl: "https://s3.us-east-005.backblazeb2.com",
      accessKey: "primary-key",
      secretKey: "primary-secret",
      bucket: "geomacro-private-archive",
    });

    await expect(
      client.putWithMetadataVerification(
        "geomacro-evidence/v1/live-write-proof.json",
        body,
      ),
    ).resolves.toEqual({
      sha256: digest,
      bytes: body.length,
      verification_mode: "signed-put-full-readback-sha256",
      full_body_readback_verified: true,
    });

    expect(methods).toEqual(["PUT", "GET"]);
    expect(client.usage()).toMatchObject({
      requests_started: 2,
      s3_requests_started: 2,
      native_read_requests_started: 0,
    });
  });

  it("uses native authenticated readback when S3 GET is denied", async () => {
    clearOptionalReadCredentials();
    process.env.B2_REQUEST_BUDGET = "5";
    const body = Buffer.from("native-readback-proof", "utf8");
    const methods: string[] = [];

    vi.stubGlobal("fetch", vi.fn(async (input, init = {}) => {
      const url = String(input);
      const method = String(init.method ?? "GET");
      methods.push(`${method} ${url}`);

      if (method === "PUT" && url.startsWith("https://s3.us-east-005.backblazeb2.com/")) {
        return new Response(null, { status: 200 });
      }
      if (method === "GET" && url.startsWith("https://s3.us-east-005.backblazeb2.com/")) {
        return new Response("<Error><Code>AccessDenied</Code></Error>", { status: 403 });
      }
      if (url === "https://api.backblazeb2.com/b2api/v4/b2_authorize_account") {
        return Response.json({
          authorizationToken: "token",
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
        return new Response(body, { status: 200 });
      }
      return new Response("unexpected", { status: 500 });
    }));

    const client = createB2Client({
      endpointUrl: "https://s3.us-east-005.backblazeb2.com",
      accessKey: "primary-key",
      secretKey: "primary-secret",
      bucket: "geomacro-private-archive",
    });

    await expect(
      client.putWithMetadataVerification(
        "geomacro-evidence/v1/native-proof.json",
        body,
      ),
    ).resolves.toMatchObject({
      sha256: createHash("sha256").update(body).digest("hex"),
      full_body_readback_verified: true,
    });

    expect(methods.some((value) => value.startsWith("HEAD "))).toBe(false);
    expect(client.usage()).toMatchObject({
      requests_started: 3,
      s3_requests_started: 2,
      native_read_requests_started: 1,
      native_read_fallback_successes: 1,
    });
  });

  it("fails closed when full readback bytes do not match the uploaded payload", async () => {
    clearOptionalReadCredentials();

    vi.stubGlobal("fetch", vi.fn(async (_input, init = {}) => {
      const method = String(init.method ?? "GET");
      if (method === "PUT") return new Response(null, { status: 200 });
      if (method === "GET") return new Response("nope", { status: 200 });
      return new Response("unexpected", { status: 500 });
    }));

    const client = createB2Client({
      endpointUrl: "https://s3.us-east-005.backblazeb2.com",
      accessKey: "primary-key",
      secretKey: "primary-secret",
      bucket: "geomacro-private-archive",
    });

    await expect(
      client.putWithMetadataVerification(
        "geomacro-evidence/v1/mismatch.json",
        Buffer.from("test"),
      ),
    ).rejects.toThrow("B2_READBACK_SHA256_MISMATCH");
  });
});
