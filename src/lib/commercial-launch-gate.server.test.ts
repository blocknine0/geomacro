import { afterEach, describe, expect, it } from "vitest";
import {
  COMMERCIAL_LAUNCH_ACK,
  assertCommercialLaunchAuthorized,
  getCommercialLaunchState,
} from "./commercial-launch-gate.server";

afterEach(() => {
  delete process.env.GEOMACRO_COMMERCIAL_LAUNCH_ACK;
});

describe("coordinated commercial launch gate", () => {
  it("defaults to prelaunch and blocks every production provider", () => {
    expect(getCommercialLaunchState()).toEqual({ authorized: false, mode: "prelaunch" });
    expect(() => assertCommercialLaunchAuthorized("coinbase_x402")).toThrow(
      "COINBASE_X402_PRODUCTION_LOCKED_UNTIL_COORDINATED_GEOMACRO_LAUNCH",
    );
    expect(() => assertCommercialLaunchAuthorized("goat_x402")).toThrow(
      "GOAT_X402_PRODUCTION_LOCKED_UNTIL_COORDINATED_GEOMACRO_LAUNCH",
    );
    expect(() => assertCommercialLaunchAuthorized("nevermined")).toThrow(
      "NEVERMINED_PRODUCTION_LOCKED_UNTIL_COORDINATED_GEOMACRO_LAUNCH",
    );
  });

  it("rejects near-miss acknowledgements", () => {
    process.env.GEOMACRO_COMMERCIAL_LAUNCH_ACK = `${COMMERCIAL_LAUNCH_ACK}_NO`;
    expect(getCommercialLaunchState().authorized).toBe(false);
  });

  it("opens only on the exact owner-controlled coordinated-launch acknowledgement", () => {
    process.env.GEOMACRO_COMMERCIAL_LAUNCH_ACK = COMMERCIAL_LAUNCH_ACK;
    expect(getCommercialLaunchState()).toEqual({ authorized: true, mode: "launched" });
    expect(() => assertCommercialLaunchAuthorized("coinbase_x402")).not.toThrow();
  });
});
