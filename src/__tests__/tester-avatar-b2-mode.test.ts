import { describe, expect, it } from "vitest";
import { testnetAvatarB2HistoricalReadEnabled } from "../lib/testnet-tester-avatar.server";

describe("authenticated tester avatar B2 historical read cutover", () => {
  it("requires both independently pinned B2 read and the avatar selection", () => {
    expect(testnetAvatarB2HistoricalReadEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(testnetAvatarB2HistoricalReadEnabled({
      GEOMACRO_LEGACY_B2_COLD_READ: "enabled",
    } as NodeJS.ProcessEnv)).toBe(false);
    expect(testnetAvatarB2HistoricalReadEnabled({
      GEOMACRO_TESTER_AVATAR_READ_BACKEND: "b2_verified_original",
    } as NodeJS.ProcessEnv)).toBe(false);
    expect(testnetAvatarB2HistoricalReadEnabled({
      GEOMACRO_LEGACY_B2_COLD_READ: "enabled",
      GEOMACRO_TESTER_AVATAR_READ_BACKEND: "b2_verified_original",
    } as NodeJS.ProcessEnv)).toBe(true);
  });
  it("does not accept near matches or accidentally turn on untested B2 mode", () => {
    for (const value of ["on", "true", "ENABLED", "disabled", ""]) {
      expect(testnetAvatarB2HistoricalReadEnabled({
        GEOMACRO_LEGACY_B2_COLD_READ: value,
        GEOMACRO_TESTER_AVATAR_READ_BACKEND: "b2_verified_original",
      } as NodeJS.ProcessEnv)).toBe(false);
    }
  });
});
