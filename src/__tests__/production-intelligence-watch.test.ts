import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(`${root}/${path}`, "utf8");
}

describe("production intelligence watch", () => {
  it("generates exactly 7000 unique seven-day probes with current and historical coverage", () => {
    const output = execFileSync(
      "node",
      ["scripts/production-watch/run-intelligence-watch.mjs"],
      { cwd: root, env: { ...process.env, WATCH_VALIDATE_ONLY: "1" }, encoding: "utf8" },
    );
    expect(output).toContain("\"unique_questions\": 7000");
    expect(output).toContain("\"probes_per_day\": 1000");
    expect(output).toContain("\"current\": 3500");
    expect(output).toContain("\"historical\": 3500");
    expect(output).toContain("\"geopolitics\": 2338");
    expect(output).toContain("\"macro\": 2338");
    expect(output).toContain("\"critical_minerals\": 2324");
  });

  it("uses true historical as-of retrieval rather than only historical wording", () => {
    const engine = read("src/lib/ask-intelligence.server.ts");
    const route = read("server/api/production-watch/ask.post.ts");
    expect(engine).toContain("options: { asOf?: string | null } = {}");
    expect(engine).toContain("retrieve(terms, categories, anchorMs)");
    expect(engine).toContain("loadPublishedGri(anchorMs, !historical)");
    expect(route).toContain("mode: z.enum([\"current\", \"historical\"])");
    expect(route).toContain("answerQuestion(input.question, { asOf:");
  });

  it("records exact output, build verification and append-only watch evidence", () => {
    const migration = read("supabase/migrations/955_production_intelligence_watch.sql");
    const runner = read("scripts/production-watch/run-intelligence-watch.mjs");
    const workflow = read(".github/workflows/production-intelligence-watch.yml");
    expect(migration).toContain("response_raw text");
    expect(migration).toContain("response_sha256 text");
    expect(migration).toContain("build_verified boolean not null default false");
    expect(migration).toContain("before update or delete");
    expect(runner).toContain("GEOMACRO_EXPECTED_PRODUCTION_SHA");
    expect(runner).toContain("probe.build.verified");
    expect(workflow).toContain("cron: \"7 0 * * *\"");
    expect(workflow).toContain("cron: \"7 6 * * *\"");
    expect(workflow).toContain("cron: \"7 12 * * *\"");
    expect(workflow).toContain("cron: \"7 18 * * *\"");
    expect(workflow).toContain("cron: \"47 23 * * *\"");
    expect((workflow.match(/WATCH_BATCH_SIZE: "250"/g) || []).length).toBe(4);
    expect(workflow).toContain("GEOMACRO_EXPECTED_PRODUCTION_SHA: ${{ github.sha }}");
  });
});
