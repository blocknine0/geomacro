import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/954_testnet_developer_api_funnel_telemetry.sql"),
  "utf8",
);
const recorder = readFileSync(
  join(process.cwd(), "src/lib/testnet-api-funnel-telemetry.server.ts"),
  "utf8",
);
const route = readFileSync(
  join(process.cwd(), "server/api/testnet/intelligence.post.ts"),
  "utf8",
);
const service = readFileSync(
  join(process.cwd(), "src/lib/testnet-intelligence-service.server.ts"),
  "utf8",
);
const commercialOps = readFileSync(
  join(process.cwd(), "src/lib/commercial-ops.server.ts"),
  "utf8",
);
const dashboard = readFileSync(
  join(process.cwd(), "server/routes/internal/commercial-ops.get.ts"),
  "utf8",
);

describe("Testnet Developer API funnel telemetry", () => {
  it("creates a private append-only stage ledger with no raw request or credential storage", () => {
    expect(migration).toContain(
      "create table if not exists public.testnet_developer_api_funnel_events",
    );
    expect(migration).toContain("attempt_id uuid not null");
    expect(migration).toContain("stage text not null");
    expect(migration).toContain("outcome text not null");
    expect(migration).toContain("principal_id uuid");
    expect(migration).toContain("before update or delete");
    expect(migration).toContain(
      "Testnet Developer API funnel telemetry is append-only",
    );
    expect(migration).toContain(
      "revoke all on table public.testnet_developer_api_funnel_events from PUBLIC, anon, authenticated",
    );
    expect(migration).toContain(
      "grant select, insert on table public.testnet_developer_api_funnel_events to service_role",
    );
    expect(migration).not.toContain("request_body");
    expect(migration).not.toContain("api_secret");
    expect(migration).not.toContain("ip_address");
  });

  it("uses a server-only recorder that fails open when telemetry storage is unavailable", () => {
    expect(recorder).toContain('from "./risk-supabase.server"');
    expect(recorder).toContain('from("testnet_developer_api_funnel_events")');
    expect(recorder).toContain('console.error("[testnet-api-funnel] telemetry write failed"');
    expect(recorder).toContain("return null;");
    expect(recorder).not.toContain("rawBody");
    expect(recorder).not.toContain("apiSecret");
  });

  it("traces the developer endpoint from receipt through validation, auth, scope, preflight, binding and completion", () => {
    for (const stage of [
      "request_received",
      "request_validation",
      "authentication",
      "scope_authorization",
      "availability_preflight",
      "request_binding",
      "intelligence_delivery",
      "completed",
    ]) {
      expect(route).toContain('"'+stage+'"');
    }
    expect(route).toContain("const attemptId = randomUUID()");
    expect(route).toContain("recordTestnetDeveloperApiFunnelEvent");
    expect(route).toContain('recordStage(stage, "failed"');
    expect(route).toContain("http_status: result.status");
  });

  it("traces payment-required, payment failure, settlement and intelligence delivery", () => {
    expect(service).toContain('stage: "payment"');
    expect(service).toContain('outcome: "started"');
    expect(service).toContain('outcome: "failed"');
    expect(service).toContain('outcome: "required"');
    expect(service).toContain('outcome: "passed"');
    expect(service).toContain('stage: "intelligence_delivery"');
    expect(service).toContain("funnel_attempt_id");
  });

  it("keeps the existing successful usage ledger while adding funnel diagnostics", () => {
    expect(service).toContain("recordCommercialUsageEvent");
    expect(service).toContain("access_surface: input.access_surface");
    expect(commercialOps).toContain("commercial_usage_events");
    expect(commercialOps).toContain("developer_api_funnel");
    expect(commercialOps).toContain("stage_rollup");
    expect(commercialOps).toContain("latest_attempts");
  });

  it("surfaces funnel attempts only in the owner-only commercial operations dashboard", () => {
    expect(dashboard).toContain("Developer API activation funnel");
    expect(dashboard).toContain("funnelCards");
    expect(dashboard).toContain("funnelRollup");
    expect(dashboard).toContain("funnelTable");
    expect(dashboard).toContain("renderDeveloperFunnel(j.data)");
    expect(dashboard).toContain("/api/internal/commercial-ops");
  });
});
