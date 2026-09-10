import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  join(process.cwd(), ".github/workflows/apply-risk-gate-production-migrations.yml"),
  "utf8",
);

describe("production migration direct database workflow", () => {
  it("does not depend on Supabase Management API linking", () => {
    expect(workflow).toContain('SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}');
    expect(workflow).toContain('supabase db push --db-url "$SUPABASE_DB_URL" --dry-run');
    expect(workflow).toContain('supabase db push --db-url "$SUPABASE_DB_URL"');
    expect(workflow).not.toContain('SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}');
    expect(workflow).not.toContain('supabase link --project-ref');
  });

  it("pins the authoritative project and validates pooler/direct identity without printing credentials", () => {
    expect(workflow).toContain('EXPECTED_SUPABASE_PROJECT_REF: ldpwajisioljyjtojvfx');
    expect(workflow).toContain("url.username === `postgres.${ref}`");
    expect(workflow).toContain("url.hostname === directHost && url.username === 'postgres'");
    expect(workflow).toContain('authoritative production database connection identity confirmed without printing credentials');
    expect(workflow).not.toContain('echo "$SUPABASE_DB_URL"');
  });

  it("keeps production migration mutation manual and plan-first", () => {
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('default: plan');
    expect(workflow).toContain("inputs.mode == 'apply'");
    expect(workflow).toContain('environment: production');
  });
});
