import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  amountUsdcToAtomic,
  decideTameionAction,
  tameionApprovalMessage,
} from "../lib/tameion-agent-contract";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

function gate(
  decision: "CONTINUE" | "REDUCE_LIMIT" | "REQUIRE_APPROVAL" | "PAUSE",
  recommended_action: "ALLOW" | "REDUCE_EXPOSURE" | "REQUIRE_HUMAN_APPROVAL" | "BLOCK",
) {
  return { decision, recommended_action, execution_authorized: false as const };
}

describe("Tameion bounded autonomous-business policy", () => {
  it("auto-executes only explicit Risk Gate ALLOW decisions inside the preset cap", () => {
    expect(
      decideTameionAction({
        preset: "balanced",
        amount_usdc: "10",
        risk_gate: gate("CONTINUE", "ALLOW"),
      }).action,
    ).toBe("AUTO_EXECUTE");

    expect(
      decideTameionAction({
        preset: "balanced",
        amount_usdc: "30",
        risk_gate: gate("CONTINUE", "ALLOW"),
      }).action,
    ).toBe("REQUIRE_APPROVAL");
  });

  it("always escalates Risk Gate review decisions and blocks hard stops", () => {
    expect(
      decideTameionAction({
        preset: "balanced",
        amount_usdc: "1",
        risk_gate: gate("REQUIRE_APPROVAL", "REQUIRE_HUMAN_APPROVAL"),
      }).action,
    ).toBe("REQUIRE_APPROVAL");

    expect(
      decideTameionAction({
        preset: "balanced",
        amount_usdc: "1",
        risk_gate: gate("PAUSE", "BLOCK"),
      }).action,
    ).toBe("BLOCK");
  });

  it("blocks values above the human approval ceiling", () => {
    expect(
      decideTameionAction({
        preset: "strict",
        amount_usdc: "30",
        risk_gate: gate("CONTINUE", "ALLOW"),
      }),
    ).toMatchObject({
      action: "BLOCK",
      reason_codes: ["amount_above_human_approval_limit"],
    });
  });

  it("uses Arc native USDC 18-decimal atomic amounts", () => {
    expect(amountUsdcToAtomic("1.5")).toBe("1500000000000000000");
  });

  it("binds human approval to one exact decision, recipient, amount and expiry", () => {
    const message = tameionApprovalMessage({
      audit_id: "11111111-1111-4111-8111-111111111111",
      recipient: "0x95ba71d21C41bDa8bBA9533f96D25f793E4137b5",
      amount_usdc: "7.5",
      expires_at: "2026-09-26T12:00:00.000Z",
    });
    expect(message).toContain("Decision: 11111111-1111-4111-8111-111111111111");
    expect(message).toContain("Amount: 7.5 USDC");
    expect(message).toContain("Network: Arc Testnet (5042002)");
    expect(message).toContain("Expires: 2026-09-26T12:00:00.000Z");
  });
});

describe("Tameion implementation security contract", () => {
  it("ships the UI, APIs, service and private audit migration", () => {
    for (const path of [
      "src/routes/tameion.tsx",
      "src/routes/api.tameion.decision.ts",
      "src/routes/api.tameion.approve.ts",
      "src/routes/api.tameion.confirm.ts",
      "src/lib/tameion-agent-service.server.ts",
      "supabase/migrations/980_tameion_agent_workflow.sql",
    ]) {
      expect(existsSync(join(ROOT, path))).toBe(true);
    }
  });

  it("preserves the permanent Risk Gate execution boundary", () => {
    const contract = read("src/lib/tameion-agent-contract.ts");
    const service = read("src/lib/tameion-agent-service.server.ts");
    const migration = read("supabase/migrations/980_tameion_agent_workflow.sql");

    expect(contract).toContain("RISK_GATE_EXECUTION_BOUNDARY_VIOLATION");
    expect(service).toContain("gate.execution_authorized !== false");
    expect(service).toContain("risk_gate_execution_authorized: false");
    expect(migration).toContain("risk_gate_execution_authorized = false");
  });

  it("verifies the exact Arc Testnet transaction before recording execution", () => {
    const service = read("src/lib/tameion-agent-service.server.ts");
    expect(service).toContain("getArcReadProvider(ARC_TESTNET)");
    expect(service).toContain("provider.getTransaction(input.tx_hash)");
    expect(service).toContain("provider.getTransactionReceipt(input.tx_hash)");
    expect(service).toContain("tx.to.toLowerCase() !== row.recipient_address.toLowerCase()");
    expect(service).toContain("tx.value.toString() !== String(row.amount_atomic)");
    expect(service).toContain('status: "EXECUTED"');
  });

  it("requires a cryptographic human approval signature for escalated payments", () => {
    const service = read("src/lib/tameion-agent-service.server.ts");
    expect(service).toContain("verifyMessage(row.approval_message, input.signature)");
    expect(service).toContain("TAMEION_APPROVAL_SIGNER_MISMATCH");
    expect(service).toContain('status: "HUMAN_APPROVED"');
  });

  it("keeps the audit ledger private from browser roles", () => {
    const migration = read("supabase/migrations/980_tameion_agent_workflow.sql");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("from PUBLIC, anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(migration).not.toContain("grant select on table public.tameion_agent_decisions to anon");
  });
});
