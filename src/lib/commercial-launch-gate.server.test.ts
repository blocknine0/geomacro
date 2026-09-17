import { afterEach, describe, expect, it } from "vitest";
import {
  COMMERCIAL_LAUNCH_ACK,
  assertCommercialLaunchAuthorized,
  getCommercialLaunchState,
} from "./commercial-launch-gate.server";

afterEach(() => {
  delete process.env.GEOMACRO_COMMERCIAL_LAUNCH_ACK;
  delete process.env.GEOMACRO_COMMERCE_EMERGENCY_FREEZE;
  delete process.env.GEOMACRO_COMMERCE_DISABLED_PROVIDERS;
});

describe("coordinated commercial launch gate", () => {
  it("defaults to prelaunch and blocks every production provider", () => {
    expect(getCommercialLaunchState()).toEqual({
      ownerAuthorized: false,
      emergencyFrozen: false,
      authorized: false,
      mode: "prelaunch",
      disabledProviders: [],
    });
    expect(() => assertCommercialLaunchAuthorized("coinbase_x402")).toThrow(
      "COINBASE_X402_PRODUCTION_LOCKED_UNTIL_COORDINATED_GEOMACRO_LAUNCH",
    );
    expect(() => assertCommercialLaunchAuthorized("circle_gateway_x402")).toThrow(
      "CIRCLE_GATEWAY_X402_PRODUCTION_LOCKED_UNTIL_COORDINATED_GEOMACRO_LAUNCH",
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
    expect(getCommercialLaunchState()).toEqual({
      ownerAuthorized: true,
      emergencyFrozen: false,
      authorized: true,
      mode: "launched",
      disabledProviders: [],
    });
    expect(() => assertCommercialLaunchAuthorized("coinbase_x402")).not.toThrow();
    expect(() => assertCommercialLaunchAuthorized("circle_gateway_x402")).not.toThrow();
    expect(() => assertCommercialLaunchAuthorized("nevermined")).not.toThrow();
  });

  it("lets an emergency freeze stop all production providers without removing the owner acknowledgement", () => {
    process.env.GEOMACRO_COMMERCIAL_LAUNCH_ACK = COMMERCIAL_LAUNCH_ACK;
    process.env.GEOMACRO_COMMERCE_EMERGENCY_FREEZE = "true";

    expect(getCommercialLaunchState()).toEqual({
      ownerAuthorized: true,
      emergencyFrozen: true,
      authorized: false,
      mode: "frozen",
      disabledProviders: [],
    });
    expect(() => assertCommercialLaunchAuthorized("coinbase_x402")).toThrow(
      "GEOMACRO_COMMERCE_EMERGENCY_FREEZE_ACTIVE",
    );
    expect(() => assertCommercialLaunchAuthorized("circle_gateway_x402")).toThrow(
      "GEOMACRO_COMMERCE_EMERGENCY_FREEZE_ACTIVE",
    );
    expect(() => assertCommercialLaunchAuthorized("nevermined")).toThrow(
      "GEOMACRO_COMMERCE_EMERGENCY_FREEZE_ACTIVE",
    );
  });

  it("can quarantine one unhealthy provider while leaving other launched rails available", () => {
    process.env.GEOMACRO_COMMERCIAL_LAUNCH_ACK = COMMERCIAL_LAUNCH_ACK;
    process.env.GEOMACRO_COMMERCE_DISABLED_PROVIDERS =
      " circle_gateway_x402 , nevermined ";

    expect(getCommercialLaunchState().disabledProviders).toEqual([
      "circle_gateway_x402",
      "nevermined",
    ]);
    expect(() => assertCommercialLaunchAuthorized("coinbase_x402")).not.toThrow();
    expect(() => assertCommercialLaunchAuthorized("circle_gateway_x402")).toThrow(
      "CIRCLE_GATEWAY_X402_PRODUCTION_QUARANTINED",
    );
    expect(() => assertCommercialLaunchAuthorized("nevermined")).toThrow(
      "NEVERMINED_PRODUCTION_QUARANTINED",
    );
  });
});
