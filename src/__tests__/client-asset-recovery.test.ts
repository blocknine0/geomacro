import { describe, expect, it } from "vitest";
import { isRecoverableClientAssetError } from "../lib/client-asset-recovery";

describe("client deployment asset recovery", () => {
  it("recognizes stale hashed module/chunk failures", () => {
    expect(
      isRecoverableClientAssetError(
        new TypeError("Failed to fetch dynamically imported module: https://geomacro.live/assets/intelligence-old.js"),
      ),
    ).toBe(true);
    expect(isRecoverableClientAssetError(new Error("ChunkLoadError: Loading chunk 418 failed"))).toBe(true);
    expect(isRecoverableClientAssetError(new Error("Importing a module script failed."))).toBe(true);
    expect(isRecoverableClientAssetError(new Error("Failed to load module script"))).toBe(true);
  });

  it("does not classify ordinary application errors as deployment asset failures", () => {
    expect(isRecoverableClientAssetError(new Error("Intelligence feed unavailable"))).toBe(false);
    expect(isRecoverableClientAssetError(new Error("Unexpected API payload"))).toBe(false);
  });
});
