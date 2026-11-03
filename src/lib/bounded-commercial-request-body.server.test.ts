import { describe, expect, it } from "vitest";
import {
  MAX_COMMERCIAL_REQUEST_BODY_BYTES,
  readBoundedCommercialBody,
} from "./bounded-commercial-request-body.server";

const target = "https://geomacro.live/api/v1/intelligence/query";
const input = (raw: string) => new Request(target, { method: "POST", body: raw });

describe("real-money request body boundary", () => {
  it("accepts 8192 bytes exactly and refuses 8193 without a content-length hint", async () => {
    expect(MAX_COMMERCIAL_REQUEST_BODY_BYTES).toBe(8192);
    expect(await readBoundedCommercialBody(input("a".repeat(8192)))).toHaveLength(8192);
    const over = input("a".repeat(8193));
    expect(over.headers.get("content-length")).toBeNull();
    const error = await readBoundedCommercialBody(over).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(Response);
    expect((error as Response).status).toBe(413);
    expect((error as Response).headers.get("cache-control")).toBe("no-store");
    expect(await (error as Response).json()).toMatchObject({
      ok: false, error: { code: "COMMERCIAL_REQUEST_BODY_TOO_LARGE" },
    });
  });

  it("counts genuine UTF-8 bytes, not JavaScript characters", async () => {
    expect(await readBoundedCommercialBody(input("é".repeat(4096)))).toBe("é".repeat(4096));
    await expect(readBoundedCommercialBody(input("é".repeat(4097))))
      .rejects.toMatchObject({ status: 413 });
  });

  it("stops streaming request bytes as soon as the hard cap is exceeded", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(7000));
        controller.enqueue(new Uint8Array(1200));
        controller.close();
      },
    });
    const request = new Request(target, {
      method: "POST", body, duplex: "half",
    } as RequestInit & { duplex: "half" });
    await expect(readBoundedCommercialBody(request))
      .rejects.toMatchObject({ status: 413 });
  });

  it("never permits callers to expand the governed commercial limit", async () => {
    await expect(readBoundedCommercialBody(input("{}"), 65536))
      .rejects.toThrow("COMMERCIAL_REQUEST_LIMIT_INVALID");
  });
});
