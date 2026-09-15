import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  readFileSync,
} from "node:fs";

import {
  CENTRAL_SECURITY_VERSION,
  REAL_FUNDS_SECURITY_ACK,
  centralSecurityClientKey,
  classifyCentralSecurityRoute,
  realFundsSecurityState,
} from "../lib/central-security.server";


const ENV_KEYS = [
  "COINBASE_X402_ENVIRONMENT",
  "GOATX402_ENVIRONMENT",
  "GEOMACRO_CENTRAL_SECURITY_MODE",
  "GEOMACRO_REAL_FUNDS_SECURITY_ACK",
  "GEOMACRO_SECURITY_FINGERPRINT_PEPPER",
  "GEOMACRO_API_CREDENTIAL_PEPPER",
  "APP_SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

const originalEnvironment = new Map(
  ENV_KEYS.map((key) => [key, process.env[key]]),
);

function restoreEnvironment() {
  for (const key of ENV_KEYS) {
    const value = originalEnvironment.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}


afterEach(() => {
  restoreEnvironment();
});


describe("Geomacro central security route boundary", () => {
  it("puts every current paid rail behind the payment security class", () => {
    expect(classifyCentralSecurityRoute("/api/x402/risk", "POST")).toBe("payment");
    expect(classifyCentralSecurityRoute("/api/goat/pilot/order", "POST")).toBe("payment");
    expect(classifyCentralSecurityRoute("/api/goat/pilot/status", "POST")).toBe("payment");
    expect(classifyCentralSecurityRoute("/api/agent/risk", "POST")).toBe("payment");
  });

  it("covers Risk Gate, commercial APIs, internal APIs and server functions centrally", () => {
    expect(classifyCentralSecurityRoute("/api/risk-gate", "POST")).toBe("risk_gate");
    expect(classifyCentralSecurityRoute("/api/commercial/structural", "POST")).toBe("commercial");
    expect(classifyCentralSecurityRoute("/api/testnet-tester/wallet", "POST")).toBe("commercial");
    expect(classifyCentralSecurityRoute("/api/internal/rebuild", "POST")).toBe("internal");
    expect(classifyCentralSecurityRoute("/_serverFn/siwe", "POST")).toBe("server_function");
    expect(classifyCentralSecurityRoute("/api/health", "GET")).toBe("public_api");
    expect(classifyCentralSecurityRoute("/", "GET")).toBe("page");
  });

  it("never stores a raw client network hint in the central client key", () => {
    process.env.GEOMACRO_SECURITY_FINGERPRINT_PEPPER = "p".repeat(64);
    const headers = new Headers({
      "cf-connecting-ip": "203.0.113.7",
    });
    const key = centralSecurityClientKey(headers);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain("203.0.113.7");
  });
});


describe("real-funds security release gate", () => {
  it("keeps Coinbase mainnet locked when only the payment rail is enabled", () => {
    process.env.COINBASE_X402_ENVIRONMENT = "production";
    delete process.env.GEOMACRO_CENTRAL_SECURITY_MODE;
    delete process.env.GEOMACRO_REAL_FUNDS_SECURITY_ACK;
    delete process.env.GEOMACRO_SECURITY_FINGERPRINT_PEPPER;
    delete process.env.GEOMACRO_API_CREDENTIAL_PEPPER;

    const state = realFundsSecurityState();
    expect(state.required).toBe(true);
    expect(state.ready).toBe(false);
    expect(state.coinbase_mainnet).toBe(true);
  });

  it("keeps GOAT mainnet behind the same central gate", () => {
    process.env.GOATX402_ENVIRONMENT = "mainnet";
    const state = realFundsSecurityState();
    expect(state.required).toBe(true);
    expect(state.ready).toBe(false);
    expect(state.goat_mainnet).toBe(true);
  });

  it("requires enforcement mode, owner acknowledgement and two dedicated peppers", () => {
    process.env.COINBASE_X402_ENVIRONMENT = "production";
    process.env.GEOMACRO_CENTRAL_SECURITY_MODE = "enforce";
    process.env.GEOMACRO_REAL_FUNDS_SECURITY_ACK = REAL_FUNDS_SECURITY_ACK;
    process.env.GEOMACRO_SECURITY_FINGERPRINT_PEPPER = "f".repeat(64);
    process.env.GEOMACRO_API_CREDENTIAL_PEPPER = "a".repeat(64);

    const state = realFundsSecurityState();
    expect(state.ready).toBe(true);
    expect(Object.values(state.checks).every(Boolean)).toBe(true);
  });
});


describe("central security deployment contract", () => {
  it("is wired as Nitro middleware ahead of route handlers", () => {
    const vite = readFileSync("vite.config.ts", "utf8");
    const middleware = readFileSync(
      "server/middleware/00-central-security.ts",
      "utf8",
    );
    const centralSecurity = readFileSync(
      "src/lib/central-security.server.ts",
      "utf8",
    );

    expect(vite).toContain('serverDir: "./server"');
    expect(middleware).toContain("enforceCentralRequestSecurity");
    expect(middleware).toContain("assertRealFundsDatabaseSecurityReady");
    expect(middleware).toContain("defineEventHandler");
    expect(middleware).toContain("X-Content-Type-Options");
    expect(middleware).toContain("Retry-After");
    expect(middleware).toContain("CENTRAL_SECURITY_VERSION");
    expect(centralSecurity).toContain(CENTRAL_SECURITY_VERSION);
  });

  it("keeps the distributed abuse ledger server-only with RLS and no raw credential fields", () => {
    const migration = readFileSync(
      "supabase/migrations/930_central_security_abuse_control.sql",
      "utf8",
    );

    expect(migration).toContain("enable row level security");
    expect(migration).toContain("from PUBLIC, anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("security definer");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("consume_central_security_budget");
    expect(migration).not.toMatch(/\bip_address\b/i);
    expect(migration).not.toMatch(/\bbearer_token\b/i);
    expect(migration).not.toMatch(/\bpayment_signature\b/i);
    expect(migration).not.toMatch(/\bcookie_value\b/i);
  });

  it("canonical environment template keeps the real-funds acknowledgement blank", () => {
    const env = readFileSync(".env.example", "utf8");
    expect(env).toContain("GEOMACRO_CENTRAL_SECURITY_MODE=enforce");
    expect(env).toContain("GEOMACRO_REAL_FUNDS_SECURITY_ACK=\n");
    expect(env).toContain("GEOMACRO_SECURITY_FINGERPRINT_PEPPER=\n");
    expect(env).toContain("GEOMACRO_API_CREDENTIAL_PEPPER=\n");
    expect(env).not.toContain(
      `GEOMACRO_REAL_FUNDS_SECURITY_ACK=${REAL_FUNDS_SECURITY_ACK}`,
    );
  });

  it("requires aggregate RLS and browser-privilege verification before real funds", () => {
    const readinessMigration = readFileSync(
      "supabase/migrations/931_central_security_database_readiness.sql",
      "utf8",
    );
    const readinessServer = readFileSync(
      "src/lib/real-funds-security-readiness.server.ts",
      "utf8",
    );

    expect(readinessMigration).toContain("central_security_database_readiness");
    expect(readinessMigration).toContain("relrowsecurity");
    expect(readinessMigration).toContain("has_table_privilege('anon'");
    expect(readinessMigration).toContain("has_table_privilege('authenticated'");
    expect(readinessMigration).toContain("'siwe_login_nonces'");
    expect(readinessMigration).toContain("'testnet_tester_sessions'");
    expect(readinessMigration).toContain("'testnet_developer_credentials'");
    expect(readinessMigration).toContain("'commercial_api_credentials'");
    expect(readinessMigration).toContain("'risk_gate_api_clients'");
    expect(readinessMigration).toContain("'coinbase_x402_deliveries'");
    expect(readinessMigration).toContain("browser_exposed_table_count");
    expect(readinessMigration).toContain("to service_role");
    expect(readinessServer).toContain("REAL_FUNDS_DATABASE_SECURITY_NOT_READY");
    expect(readinessServer).toContain("missing_table_count");
    expect(readinessServer).toContain("browser_exposed_table_count");
  });
});
