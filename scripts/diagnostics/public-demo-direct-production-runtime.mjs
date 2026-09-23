import { runAgenticPreflightDemo } from "../../src/lib/agentic-demo-service.server.ts";

const scenarios = [
  ["USA>CHN", { subject: { type: "corridor", origin_country_iso3: "USA", destination_country_iso3: "CHN" }, policy_preset: "cautious", action_type: "agent_payment", amount_usdc: 10000 }],
  ["CHN>USA", { subject: { type: "corridor", origin_country_iso3: "CHN", destination_country_iso3: "USA" }, policy_preset: "cautious", action_type: "agent_payment", amount_usdc: 10000 }],
  ["USA", { subject: { type: "country", country_iso3: "USA" }, policy_preset: "cautious", action_type: "agent_payment", amount_usdc: 10000 }],
  ["CHN", { subject: { type: "country", country_iso3: "CHN" }, policy_preset: "cautious", action_type: "agent_payment", amount_usdc: 10000 }],
];

let failed = false;
for (const [name, input] of scenarios) {
  try {
    const result = await runAgenticPreflightDemo(input, { mode: "PUBLIC_SANDBOX", recordTelemetry: false });
    console.log(JSON.stringify({ scenario: name, ok: result.ok, object_id: result.risk_object.object_id, execution_authorized: result.risk_gate.execution_authorized, structural_status: result.structural_context.status, gri_available: result.gri_context !== null }));
  } catch (error) {
    failed = true;
    console.error(JSON.stringify({ scenario: name, ok: false, error_name: error instanceof Error ? error.name : "unknown", error_message: error instanceof Error ? error.message : String(error), stack_tail: error instanceof Error ? (error.stack ?? "").split("\n").slice(-8) : [] }));
  }
}
if (failed) process.exit(1);
