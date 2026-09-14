import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/926_a2a_protocol_v1.sql", "utf8");

describe("A2A database migration", () => {
  it("creates durable task, callback and outbound audit state", () => {
    for (const table of [
      "public.a2a_tasks",
      "public.a2a_task_events",
      "public.a2a_push_notification_configs",
      "public.a2a_push_delivery_events",
      "public.a2a_outbound_interactions",
    ]) {
      expect(migration).toContain(`create table if not exists ${table}`);
      expect(migration).toContain(`alter table ${table} enable row level security`);
      expect(migration).toContain(`revoke all on table ${table} from PUBLIC, anon, authenticated`);
      expect(migration).toContain(`grant all on table ${table} to service_role`);
    }
  });

  it("never persists callback plaintext credentials", () => {
    expect(migration).toContain("token_hash text");
    expect(migration).not.toContain("callback_secret");
    expect(migration).not.toContain("bearer_token");
    expect(migration).toContain("Plaintext callback credentials are never persisted");
  });

  it("keeps client message ids idempotent per principal", () => {
    expect(migration).toContain("unique (principal_id, client_message_id)");
    expect(migration).toContain("request_sha256 text not null");
  });
});
