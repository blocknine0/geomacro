import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/046_goat_partner_pilot_evidence.sql",
  "utf8",
);
const service = readFileSync("src/lib/goat-pilot-service.server.ts", "utf8");
const flow = readFileSync("src/lib/goat-flow.server.ts", "utf8");

describe("GOAT x402 mainnet-readiness static acceptance contract", () => {
  it("keeps Testnet3 and Mainnet explicitly separated with official chain identities", () => {
    expect(flow).toContain("chain_id: 48816");
    expect(flow).toContain('caip2: "eip155:48816"');
    expect(flow).toContain("chain_id: 2345");
    expect(flow).toContain('caip2: "eip155:2345"');
    expect(migration).toContain("environment in ('testnet3', 'mainnet')");
  });

  it("keeps mainnet commercial fulfillment disabled until the explicit production gate is enabled", () => {
    expect(service).toContain("GOATX402_MAINNET_COMMERCIAL_ENABLED");
    expect(service).toContain("GOAT_MAINNET_DISABLED");
    expect(service).toContain("mainnet commercial fulfillment is disabled until production launch gates pass");
  });

  it("serializes idempotent request claims and distinguishes replay from conflicting terms", () => {
    expect(migration).toContain("unique (external_agent_id, idempotency_key)");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("'CLAIMED'::text");
    expect(migration).toContain("'REPLAY'::text");
    expect(migration).toContain("'CONFLICT'::text");
    expect(service).toContain("GOAT_PILOT_IDEMPOTENCY_CONFLICT");
  });

  it("prevents duplicate settlement and duplicate delivery identities", () => {
    expect(migration).toContain("payment_id uuid not null unique");
    expect(migration).toContain("goat_order_id text not null unique");
    expect(migration).toContain("tx_hash text not null unique");
    expect(migration).toContain("request_id uuid primary key");
  });

  it("keeps paid intelligence evidence immutable and execution disabled", () => {
    expect(migration).toContain("prevent_agent_goat_pilot_evidence_mutation");
    expect(migration).toContain("GOAT partner-pilot evidence records are immutable");
    expect(migration).toContain("execution_authorized boolean not null default false");
    expect(migration).toContain("check (execution_authorized = false)");
    expect(service).toContain("GOAT_RESOURCE_EXECUTION_BOUNDARY_VIOLATION");
  });

  it("requires exact challenge/payment terms before fulfillment", () => {
    expect(migration).toContain("GOAT challenge does not match persisted pilot terms");
    expect(migration).toContain("invalid GOAT paid-fulfillment payload");
    expect(flow).toContain("GOAT paid payer mismatch");
    expect(flow).toContain("GOAT paid chain mismatch");
    expect(flow).toContain("GOAT paid token contract mismatch");
    expect(flow).toContain("GOAT paid token symbol mismatch");
    expect(flow).toContain("GOAT paid amount mismatch");
  });

  it("fails closed on ambiguous payment confirmation rather than creating another payment", () => {
    expect(flow).toContain("GOAT order confirmation timed out; reconcile before creating another payment");
    expect(service).toContain("GOAT_ORDER_LEDGER_INCONSISTENT");
  });
});
