import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRiskSupabase: vi.fn(),
  evaluateCountryRiskGate: vi.fn(),
  evaluateCorridorRiskGate: vi.fn(),
}));

vi.mock("../lib/risk-supabase.server", () => ({
  requireRiskSupabase: mocks.requireRiskSupabase,
}));

vi.mock("../lib/risk-gate-service.server", () => ({
  evaluateCountryRiskGate: mocks.evaluateCountryRiskGate,
}));

vi.mock("../lib/corridor-risk-gate-service.server", () => ({
  evaluateCorridorRiskGate: mocks.evaluateCorridorRiskGate,
}));

import { handleExternalRiskGateRequest } from "../lib/risk-gate-api.server";

const API_KEY = "g".repeat(64);

function body() {
  return {
    request_id: "security_runtime_001",
    country_iso3: "USA",
    policy: {
      policy_id: "pilot-policy",
      policy_version: "1.0.0",
      continue_max_score: 35,
      reduce_limit_max_score: 55,
      require_approval_max_score: 75,
      minimum_confidence_for_auto_continue: 0.8,
      require_commercial_verification_for_continue: true,
      max_positive_delta_for_auto_continue: 10,
      hard_stop_driver_contributions: {
        sanctions: 20,
      },
    },
  };
}

function request(options: { authorization?: boolean; contentType?: string } = {}) {
  const headers = new Headers({
    "content-type": options.contentType ?? "application/json",
  });
  if (options.authorization !== false) {
    headers.set("authorization", `Bearer ${API_KEY}`);
  }
  return new Request("https://geomacro.live/api/risk-gate", {
    method: "POST",
    headers,
    body: JSON.stringify(body()),
  });
}

type DbOptions = {
  authError?: boolean;
  enabled?: boolean;
  rateError?: boolean;
  rateAllowed?: boolean;
  auditError?: boolean;
};

function makeDb(options: DbOptions = {}) {
  const auditInsert = vi.fn(async () => ({
    error: options.auditError ? { message: "audit backend unavailable" } : null,
  }));

  const maybeSingle = vi.fn(async () => ({
    data: options.authError
      ? null
      : {
          client_id: "client_test",
          display_name: "Test client",
          api_key_hash: await import("node:crypto").then(({ createHash }) =>
            createHash("sha256").update(API_KEY).digest("hex"),
          ),
          enabled: options.enabled ?? true,
          requests_per_minute: 60,
        },
    error: options.authError ? { message: "auth backend unavailable" } : null,
  }));

  const db = {
    from: vi.fn((table: string) => {
      if (table === "risk_gate_api_clients") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle }),
          }),
        };
      }
      if (table === "risk_gate_audit_log") {
        return { insert: auditInsert };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
    rpc: vi.fn(async () => ({
      data: options.rateError
        ? null
        : [
            {
              allowed: options.rateAllowed ?? true,
              request_count: 1,
              limit_count: 60,
              window_started_at: "2026-09-12T00:00:00.000Z",
            },
          ],
      error: options.rateError ? { message: "rate backend unavailable" } : null,
    })),
  };

  return { db, auditInsert };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.evaluateCountryRiskGate.mockResolvedValue({
    response: {
      decision: "CONTINUE",
      reason_codes: [],
      execution_authorized: false,
    },
    context: {
      risk_object_id: "gro_security_001",
      methodology_version: "gri-v1.2.0",
      evaluated_at: "2026-09-12T00:00:00.000Z",
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Risk Gate runtime fail-closed matrix", () => {
  it("rejects missing authentication before touching privileged storage", async () => {
    const response = await handleExternalRiskGateRequest(
      request({ authorization: false }),
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toMatchObject({
      ok: false,
      error: { code: "AUTHENTICATION_REQUIRED" },
      execution_authorized: false,
    });
    expect(mocks.requireRiskSupabase).not.toHaveBeenCalled();
  });

  it("fails closed when the authentication backend is unavailable", async () => {
    const { db } = makeDb({ authError: true });
    mocks.requireRiskSupabase.mockReturnValue(db);

    const response = await handleExternalRiskGateRequest(request());
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe("AUTH_BACKEND_UNAVAILABLE");
    expect(payload.execution_authorized).toBe(false);
    expect(mocks.evaluateCountryRiskGate).not.toHaveBeenCalled();
  });

  it("fails closed for a disabled client", async () => {
    const { db } = makeDb({ enabled: false });
    mocks.requireRiskSupabase.mockReturnValue(db);

    const response = await handleExternalRiskGateRequest(request());
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error.code).toBe("CLIENT_DISABLED");
    expect(payload.execution_authorized).toBe(false);
    expect(mocks.evaluateCountryRiskGate).not.toHaveBeenCalled();
  });

  it("fails closed and records the authenticated failure when rate limiting is unavailable", async () => {
    const { db, auditInsert } = makeDb({ rateError: true });
    mocks.requireRiskSupabase.mockReturnValue(db);

    const response = await handleExternalRiskGateRequest(request());
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe("RATE_LIMIT_BACKEND_UNAVAILABLE");
    expect(payload.execution_authorized).toBe(false);
    expect(mocks.evaluateCountryRiskGate).not.toHaveBeenCalled();
    expect(auditInsert).toHaveBeenCalledTimes(1);
  });

  it("does not deliver a successful decision when immutable audit persistence fails", async () => {
    const { db, auditInsert } = makeDb({ auditError: true });
    mocks.requireRiskSupabase.mockReturnValue(db);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await handleExternalRiskGateRequest(request());
    const payload = await response.json();

    expect(mocks.evaluateCountryRiskGate).toHaveBeenCalledTimes(1);
    expect(auditInsert).toHaveBeenCalled();
    expect(response.status).toBe(500);
    expect(payload.error.code).toBe("RISK_GATE_FAILED");
    expect(payload.execution_authorized).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("blocks any evaluator regression that attempts to authorize execution", async () => {
    const { db, auditInsert } = makeDb();
    mocks.requireRiskSupabase.mockReturnValue(db);
    mocks.evaluateCountryRiskGate.mockResolvedValueOnce({
      response: {
        decision: "CONTINUE",
        reason_codes: [],
        execution_authorized: true,
      },
      context: {
        risk_object_id: "gro_security_002",
        methodology_version: "gri-v1.2.0",
        evaluated_at: "2026-09-12T00:00:00.000Z",
      },
    });

    const response = await handleExternalRiskGateRequest(request());
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload.error.code).toBe("RISK_GATE_FAILED");
    expect(payload.execution_authorized).toBe(false);
    expect(auditInsert).toHaveBeenCalledTimes(1);
  });

  it("returns a successful decision only after the immutable audit insert succeeds", async () => {
    const { db, auditInsert } = makeDb();
    mocks.requireRiskSupabase.mockReturnValue(db);

    const response = await handleExternalRiskGateRequest(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.risk_gate.execution_authorized).toBe(false);
    expect(payload.audit_id).toMatch(/^rga_/);
    expect(auditInsert).toHaveBeenCalledTimes(1);
  });
});
