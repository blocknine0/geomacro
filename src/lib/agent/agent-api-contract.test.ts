import { describe, expect, it } from "vitest";
import {
  AGENT_CAPABILITIES,
  AGENT_ERROR_CODES,
  AGENT_ERROR_STATUS,
  GEOMACRO_AGENT_API_VERSION,
  GEOMACRO_AGENT_SCHEMA_VERSION,
  agentError,
} from "./agent-api-contract";

describe("agent API contract", () => {
  it("centralizes version and capability identifiers", () => {
    expect(GEOMACRO_AGENT_API_VERSION).toBe("1.0.0");
    expect(GEOMACRO_AGENT_SCHEMA_VERSION).toMatch(/^geomacro-agent-/);
    expect(AGENT_CAPABILITIES.EVENT_INTELLIGENCE).toBe("event.intelligence.v1");
  });

  it("keeps errors stable and provider-safe", () => {
    const body = agentError(AGENT_ERROR_CODES.INTELLIGENCE_NOT_FOUND);
    expect(body).toEqual({
      error: { code: "INTELLIGENCE_NOT_FOUND", message: expect.any(String) },
    });
    expect(AGENT_ERROR_STATUS.PAYMENT_REQUIRED).toBe(402);
    expect(JSON.stringify(body)).not.toContain("Supabase");
  });
});
