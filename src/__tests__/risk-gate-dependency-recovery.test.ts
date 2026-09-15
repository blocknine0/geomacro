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

import { apiCredentialDigest } from "../lib/api-credential-hash.server";
import { handleExternalRiskGateRequest } from "../lib/risk-gate-api.server";

const API_KEY = "r".repeat(64);
const TEST_PEPPER = "risk-gate-recovery-test-pepper".padEnd(64, "x");
let activeDb: ReturnType<typeof makeDb>["db"];

function body(requestId: string) {
  return {
    request_id: requestId,
    country_iso3: "USA",
    policy: {
      policy_id: "recovery-policy",
      policy_version: "1.0.0",
      continue_max_score: 35,
      reduce_limit_max_score: 55,
      require_approval_max_score: 75,
      minimum_confidence_for_auto_continue: 0.8,
      require_commercial_verification_for_continue: true,
      max_positive_delta_for_auto_continue: 10,
      hard_stop_driver_contributions: { sanctions: 20 },
    },
  };
}

function request(requestId: string) {
  return new Request("https://geomacro.live/api/risk-gate", {
    method: "POST",
    headers: {
      authorization: `Bearer ${API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body(requestId)),
  });
}

type DbOptions = {
  authError?: boolean;
  rateError?: boolean;
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
          client_id: "client_recovery_test",
          display_name: "Recovery test client",
          api_key_hash: apiCredentialDigest(API_KEY, "risk-gate-bearer"),
          enabled: true,
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
              allowed: true,
              request_count: 1,
              limit_count: 60,
              window_started_at: "2026-09-15T00:00:00.000Z",
            },
          ],
      error: options.rateError ? { message: "rate backend unavailable" } : null,
    })),
  };

  return { db, auditInsert };
}

function healthyEvaluation() {
  return {
    response: {
      decision: "CONTINUE",
      reason_codes: [],
      execution_authorized: false,
    },
    context: {
      risk_object_id: "gro_recovery_001",
      methodology_version: "gri-v1.2.0",
      evaluated_at: "2026-09-15T00:00:00.000Z",
    },
  };
}

async function expectFailClosed(response: Response, status: number, code: string) {
  const payload = await response.json();
  expect(response.status).toBe(status);
  expect(payload.error.code).toBe(code);
  expect(payload.execution_authorized).toBe(false);
}

async function expectRecovered(response: Response) {
  const payload = await response.json();
  expect(response.status).toBe(200);
  expect(payload.ok).toBe(true);
  expect(payload.risk_gate.execution_authorized).toBe(false);
  expect(payload.audit_id).toMatch(/^rga_/);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GEOMACRO_API_CREDENTIAL_PEPPER", TEST_PEPPER);
  activeDb = makeDb().db;
  mocks.requireRiskSupabase.mockImplementation(() => activeDb);
  mocks.evaluateCountryRiskGate.mockResolvedValue(healthyEvaluation());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("Risk Gate dependency outage and recovery", () => {
  it("fails closed during an auth-backend outage and recovers only after auth is healthy", async () => {
    const failed = makeDb({ authError: true });
    const recovered = makeDb();
    activeDb = failed.db;

    await expectFailClosed(
      await handleExternalRiskGateRequest(request("recovery_auth_001")),
      503,
      "AUTH_BACKEND_UNAVAILABLE",
    );
    expect(mocks.evaluateCountryRiskGate).not.toHaveBeenCalled();

    activeDb = recovered.db;
    await expectRecovered(
      await handleExternalRiskGateRequest(request("recovery_auth_002")),
    );
    expect(mocks.evaluateCountryRiskGate).toHaveBeenCalledTimes(1);
  });

  it("fails closed during a rate-limit backend outage and returns to service after recovery", async () => {
    const failed = makeDb({ rateError: true });
    const recovered = makeDb();
    activeDb = failed.db;

    await expectFailClosed(
      await handleExternalRiskGateRequest(request("recovery_rate_001")),
      503,
      "RATE_LIMIT_BACKEND_UNAVAILABLE",
    );

    activeDb = recovered.db;
    await expectRecovered(
      await handleExternalRiskGateRequest(request("recovery_rate_002")),
    );
  });

  it("withholds a decision while immutable audit persistence is down and recovers after persistence returns", async () => {
    const failed = makeDb({ auditError: true });
    const recovered = makeDb();
    activeDb = failed.db;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expectFailClosed(
      await handleExternalRiskGateRequest(request("recovery_audit_001")),
      500,
      "RISK_GATE_FAILED",
    );
    expect(failed.auditInsert).toHaveBeenCalledTimes(1);

    activeDb = recovered.db;
    await expectRecovered(
      await handleExternalRiskGateRequest(request("recovery_audit_002")),
    );
    expect(recovered.auditInsert).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("fails closed on a Risk Object/read-path exception and does not reuse the failed result after recovery", async () => {
    const db = makeDb();
    activeDb = db.db;
    mocks.evaluateCountryRiskGate
      .mockRejectedValueOnce(new Error("risk object read path unavailable"))
      .mockResolvedValueOnce(healthyEvaluation());
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expectFailClosed(
      await handleExternalRiskGateRequest(request("recovery_read_001")),
      500,
      "RISK_GATE_FAILED",
    );

    await expectRecovered(
      await handleExternalRiskGateRequest(request("recovery_read_002")),
    );
    expect(mocks.evaluateCountryRiskGate).toHaveBeenCalledTimes(2);
  });
});
