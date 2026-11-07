import { afterEach, describe, expect, it, vi } from "vitest";
import { b2PrivateArchiveReadConfigured,readPrivateB2Object } from "../lib/b2-private-archive-read.server";

const KEYS = [
  "B2_ARCHIVE_READ_KEY_ID",
  "B2_ARCHIVE_READ_APPLICATION_KEY",
  "B2_ARCHIVE_WRITE_KEY_ID",
  "B2_ARCHIVE_WRITE_APPLICATION_KEY",
  "B2_KEY_ID",
  "B2_APPLICATION_KEY",
  "B2_S3_ENDPOINT",
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
  "D1_DATABASE_ID",
  "B2_ACCOUNT_QUOTA_REQUIRED",
  "B2_ACCOUNT_QUOTA_WORKFLOW_ID",
  "GEOMACRO_CONTROL_PLANE_TOKEN",
  "CONTROL_PLANE_TOKEN",
  "GEOMACRO_COMMERCE_LEDGER_TOKEN",
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

function setReadCredentials(suffix: string) {
  for (const key of KEYS) delete process.env[key];
  process.env.B2_ARCHIVE_READ_KEY_ID = `read-key-${suffix}`;
  process.env.B2_ARCHIVE_READ_APPLICATION_KEY = `read-secret-${suffix}`;
  process.env.B2_S3_ENDPOINT = "https://s3.us-east-005.backblazeb2.com";
  process.env.CLOUDFLARE_ACCOUNT_ID = "1234567890abcdef1234567890abcdef";
  process.env.CLOUDFLARE_API_TOKEN = "t".repeat(64);
  process.env.D1_DATABASE_ID = "abcdef1234567890abcdef1234567890";
  process.env.B2_ACCOUNT_QUOTA_REQUIRED = "1";
}

// Simulate the existing two-step atomic account-wide D1 reservation.
// The private reader must never contact B2 until this receipt is valid.
function quotaReceipt(url: string, init: any): Response | null {
  if (!url.startsWith("https://api.cloudflare.com/client/v4/accounts/")) return null;
  const sql = JSON.parse(init.body).sql as string;
  return Response.json({ success:true, result:[{success:true,results:
    sql.includes("b2_account_daily_request_quota") ?
    [{total_requests:1,get_requests:1,put_requests:0,head_requests:0,native_auth_requests:0}] : []
  }] });
}

describe("private B2 server native fallback", () => {
  it("uses authenticated Control Plane tickets without privileged D1 API secrets",async()=>{
    setReadCredentials("worker-authorized");
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.D1_DATABASE_ID;
    process.env.GEOMACRO_CONTROL_PLANE_TOKEN="q".repeat(64);
    expect(b2PrivateArchiveReadConfigured()).toBe(true);
    const seen: string[]=[];
    vi.stubGlobal("fetch",vi.fn(async (input,init:any={})=>{
      const url=String(input);seen.push(url);
      if(url.endsWith("/v1/b2-quota/reserve")){
        expect(init.headers.Authorization).toBe("Bearer "+"q".repeat(64));
        const payload=JSON.parse(init.body);
        expect(payload).toEqual({kind:"GET",workflow_id:"private_archive_read"});
        return Response.json({ok:true,schema:"geomacro.b2-account-request-reservation.v1",
          reserved:true,kind:"GET",b2_operation_performed:false,chargeable:false});
      }
      if(url.startsWith("https://s3.us-east-005.backblazeb2.com/"))
        return new Response("protected-verified-bytes",{status:200});
      throw Error("UNEXPECTED_QUOTA_TRANSPORT");
    }));
    const bytes=await readPrivateB2Object("geomacro-evidence/v1/review.json");
    expect(bytes.toString()).toBe("protected-verified-bytes");
    expect(seen).toHaveLength(2);
    expect(seen[0]).toContain("/v1/b2-quota/reserve");
  });
  it("never contacts B2 or falls back to D1 when the selected Control Plane rejects a reservation",async()=>{
    setReadCredentials("worker-denied");
    // Even with an alternate primary credential, one denied shared quota
    // ticket must be terminal; never rotate credentials or retry admission.
    process.env.B2_KEY_ID="primary-alternate";
    process.env.B2_APPLICATION_KEY="alternate-secret";
    process.env.GEOMACRO_CONTROL_PLANE_TOKEN="q".repeat(64);
    const seen:string[]=[];
    vi.stubGlobal("fetch",vi.fn(async (input)=>{
      seen.push(String(input));
      return Response.json({ok:false,error:"B2_GLOBAL_DAILY_QUOTA_EXHAUSTED"},{status:429});
    }));
    await expect(readPrivateB2Object("geomacro-evidence/v1/review.json"))
      .rejects.toThrow("B2_PRIVATE_ACCOUNT_QUOTA_HELD");
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain("/v1/b2-quota/reserve");
  });
  it("holds the private restore before B2 when the shared D1 quota is unavailable", async () => {
    setReadCredentials("quota-denied");
    const seen: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input) => {
      const url = String(input);
      seen.push(url);
      return new Response("unavailable", {status:503});
    }));
    await expect(readPrivateB2Object("geomacro-evidence/v1/critical.json"))
      .rejects.toThrow("B2_PRIVATE_ACCOUNT_QUOTA_HELD");
    expect(seen).toHaveLength(1);
    expect(seen.every(url => url.startsWith("https://api.cloudflare.com/"))).toBe(true);
  });
  it("requires canonical D1 provider credentials even if B2 credentials exist", async () => {
    setReadCredentials("missing-db");
    delete process.env.D1_DATABASE_ID;
    const fetchMock = vi.fn(async () => new Response("unexpected"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(readPrivateB2Object("geomacro-evidence/v1/signed.json"))
      .rejects.toThrow("B2_ACCOUNT_GLOBAL_QUOTA_CONFIGURATION_REQUIRED");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("falls back from exact S3 AccessDenied to scoped native authenticated download", async () => {
    setReadCredentials("success");
    vi.stubGlobal("fetch", vi.fn(async (input, init = {}) => {
      const url = String(input);
      const reserved = quotaReceipt(url, init);
      if (reserved) return reserved;
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
    setReadCredentials("missing-capability");
    vi.stubGlobal("fetch", vi.fn(async (input, init = {}) => {
      const url = String(input);
      const reserved = quotaReceipt(url, init);
      if (reserved) return reserved;
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
  it("reuses native authorization for 24 hours and refreshes it after expiry", async () => {
    setReadCredentials("24h-cache");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-04T00:00:00.000Z"));
    let authorizations = 0;
    vi.stubGlobal("fetch", vi.fn(async (input, init = {}) => {
      const url = String(input);
      const reserved = quotaReceipt(url, init);
      if (reserved) return reserved;
      if (url.startsWith("https://s3.us-east-005.backblazeb2.com/")) {
        return new Response("<Error><Code>AccessDenied</Code></Error>", { status: 403 });
      }
      if (url === "https://api.backblazeb2.com/b2api/v4/b2_authorize_account") {
        authorizations += 1;
        return Response.json({
          authorizationToken: `native-token-${authorizations}`,
          apiInfo: { storageApi: {
            downloadUrl: "https://f005.backblazeb2.com",
            allowed: { capabilities: ["readFiles"],
              buckets: [{ name: "geomacro-private-archive" }],
              namePrefix: "geomacro-evidence/v1/" },
          } },
        });
      }
      if (url.startsWith("https://f005.backblazeb2.com/file/")) {
        return new Response("ok", { status: 200 });
      }
      return new Response("unexpected", { status: 500 });
    }));

    await readPrivateB2Object("geomacro-evidence/v1/first.json", { maxBytes: 1024 });
    await readPrivateB2Object("geomacro-evidence/v1/second.json", { maxBytes: 1024 });
    expect(authorizations).toBe(1);
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000 + 1);
    await readPrivateB2Object("geomacro-evidence/v1/third.json", { maxBytes: 1024 });
    expect(authorizations).toBe(2);
    vi.useRealTimers();
  });
  it("stops on native download cap instead of trying another credential", async () => {
    setReadCredentials("hard-cap");
    process.env.B2_KEY_ID = "primary-key";
    process.env.B2_APPLICATION_KEY = "primary-secret";
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input, init = {}) => {
      const url = String(input);
      const reserved = quotaReceipt(url, init);
      if (reserved) return reserved;
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
