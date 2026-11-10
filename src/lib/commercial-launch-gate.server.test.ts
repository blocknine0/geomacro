import { afterEach, describe, expect, it } from "vitest";
import {
  COMMERCIAL_LAUNCH_ACK,
  assertCommercialLaunchAuthorized,
  getCommercialLaunchState, GEOMACRO_NEW_SALES_RAIL_SCOPE,
  GEOMACRO_APPROVED_CRYPTO_PROVIDERS,
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
      disabledProviders: ["circle_gateway_x402","goat_x402","nevermined","paypal"],
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
      disabledProviders: ["circle_gateway_x402","goat_x402","nevermined","paypal"],
    });
    expect(() => assertCommercialLaunchAuthorized("coinbase_x402")).not.toThrow();
    expect(() => assertCommercialLaunchAuthorized("xpay_x402")).not.toThrow();
    expect(() => assertCommercialLaunchAuthorized("dexter_x402")).not.toThrow();
    for(const provider of ["paypal","circle_gateway_x402","nevermined","goat_x402","stripe"]){
      expect(() => assertCommercialLaunchAuthorized(provider))
        .toThrow("_NEW_SALES_OUTSIDE_CRYPTO_ONLY_SCOPE");
    }
  });

  it("lets an emergency freeze stop all production providers without removing the owner acknowledgement", () => {
    process.env.GEOMACRO_COMMERCIAL_LAUNCH_ACK = COMMERCIAL_LAUNCH_ACK;
    process.env.GEOMACRO_COMMERCE_EMERGENCY_FREEZE = "true";

    expect(getCommercialLaunchState()).toEqual({
      ownerAuthorized: true,
      emergencyFrozen: true,
      authorized: false,
      mode: "frozen",
      disabledProviders: ["circle_gateway_x402","goat_x402","nevermined","paypal"],
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
      "circle_gateway_x402","goat_x402","nevermined","paypal",
    ]);
    expect(() => assertCommercialLaunchAuthorized("coinbase_x402")).not.toThrow();
    expect(() => assertCommercialLaunchAuthorized("circle_gateway_x402")).toThrow(
      "CIRCLE_GATEWAY_X402_NEW_SALES_OUTSIDE_CRYPTO_ONLY_SCOPE",
    );
    expect(() => assertCommercialLaunchAuthorized("nevermined")).toThrow(
      "NEVERMINED_NEW_SALES_OUTSIDE_CRYPTO_ONLY_SCOPE",
    );
  });
});


describe("owner crypto-only permanent routing boundary",()=>{
  it("never allows fiat or an unsupported network provider, regardless of approval ACK",()=>{
    expect(GEOMACRO_NEW_SALES_RAIL_SCOPE).toBe("CRYPTO_ONLY_BASE_POLYGON_NATIVE_USDC");
    expect(GEOMACRO_APPROVED_CRYPTO_PROVIDERS).toEqual([
      "coinbase_x402","xpay_x402","dexter_x402",
    ]);
    process.env.GEOMACRO_COMMERCIAL_LAUNCH_ACK=COMMERCIAL_LAUNCH_ACK;
    process.env.GEOMACRO_COMMERCE_EMERGENCY_FREEZE="false";
    process.env.GEOMACRO_COMMERCE_DISABLED_PROVIDERS="";
    for(const p of ["paypal","stripe","nevermined","circle_gateway_x402","goat_x402"]){
      expect(()=>assertCommercialLaunchAuthorized(p)).toThrow("NEW_SALES_OUTSIDE_CRYPTO_ONLY_SCOPE");
    }
    expect(()=>assertCommercialLaunchAuthorized("coinbase_x402")).not.toThrow();
    expect(()=>assertCommercialLaunchAuthorized("xpay_x402")).not.toThrow();
    expect(()=>assertCommercialLaunchAuthorized("dexter_x402")).not.toThrow();
  });
});
