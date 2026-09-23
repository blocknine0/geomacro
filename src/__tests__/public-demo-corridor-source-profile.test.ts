import { describe, expect, it } from "vitest";

import {
  corridorCountrySourceDeliveryProfile,
} from "@/lib/corridor-risk-publisher.server";

describe("public demo corridor source delivery profile", () => {
  it("uses canonical endpoint GROs while retaining the public demo corridor profile", () => {
    expect(corridorCountrySourceDeliveryProfile("PUBLIC_DEMO")).toBe("CANONICAL");
  });

  it("leaves canonical source selection unchanged", () => {
    expect(corridorCountrySourceDeliveryProfile("CANONICAL")).toBe("CANONICAL");
  });
});
