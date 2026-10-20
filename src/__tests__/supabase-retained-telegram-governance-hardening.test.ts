import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const path="supabase/migrations/20261020211500_retained_telegram_governance_security_hardening.sql";
describe("interim old Supabase governance security without changing business rules",()=>{
 const sql=readFileSync(path,"utf8");
 it("enables RLS and removes anon/authenticated mass write privilege",()=>{
  expect(sql).toContain("ALTER TABLE public.live_telegram_source_candidates ENABLE ROW LEVEL SECURITY");
  expect(sql).toContain("REVOKE ALL PRIVILEGES ON TABLE public.live_telegram_source_candidates FROM PUBLIC, anon, authenticated");
  expect(sql).toContain("REVOKE ALL PRIVILEGES ON TABLE public.live_telegram_governance_status FROM PUBLIC, anon, authenticated");
  expect(sql).toContain("security_invoker = true");
 });
 it("pins all 3 SQL functions without deleting data or bypassing source approvals",()=>{
  for(const f of ["trg_sync_telegram_authorized_feed_source_state",
    "enforce_telegram_flash_authorization",
    "sync_telegram_authorized_feed_source_state"])
    expect(sql).toContain("ALTER FUNCTION public."+f+"()");
  expect((sql.match(/SET search_path = pg_catalog, public/g)||[])).toHaveLength(3);
  expect(sql).not.toMatch(/\b(DROP|TRUNCATE|DELETE FROM|SET row_security = off)\b/i);
  expect(sql).not.toContain("enabled_for_commercial_signals = true");
  const replay=readFileSync("supabase/migrations/9996_telegram_governance_security_post_creation_replay.sql","utf8");
  expect(replay).toContain("ALTER TABLE public.live_telegram_source_candidates ENABLE ROW LEVEL SECURITY");
  expect(replay).toContain("security_invoker = true");
  expect(replay).toContain("SET search_path = pg_catalog, public");
  expect(replay).not.toMatch(/\\b(?:DROP|TRUNCATE|DELETE FROM)\\b/i);
 });
});
