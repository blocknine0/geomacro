import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ts from "typescript";

const patchPath =
  "scripts/patch-live-structure-private-error-serializer.mjs";
const runtimePath =
  "supabase/functions/live-structure-intelligence/index.ts";
const deployPath =
  ".github/workflows/deploy-live-structure-intelligence.yml";

const patch = fs.readFileSync(patchPath, "utf8");
const deploy = fs.readFileSync(deployPath, "utf8");

describe("live structure stable event identity", () => {
  it("resolves an exact canonical story before allocating a replacement event id", () => {
    expect(patch).toContain('"canonical_story_lookup"');
    expect(patch).toContain('"story_key"');
    expect(patch).toContain(".maybeSingle()");
    expect(patch).toContain("canonicalStory.id");
    expect(patch).toContain("evidenceCount");
    expect(patch).toContain("firstSeenAt");
    expect(patch).toContain("sourceFamilies");
  });

  it("applies the production patch to an isolated runtime copy and produces valid TypeScript syntax", () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "geomacro-live-structure-"),
    );

    try {
      const tempPatch = path.join(root, patchPath);
      const tempRuntime = path.join(root, runtimePath);
      fs.mkdirSync(path.dirname(tempPatch), { recursive: true });
      fs.mkdirSync(path.dirname(tempRuntime), { recursive: true });
      fs.copyFileSync(patchPath, tempPatch);
      fs.copyFileSync(runtimePath, tempRuntime);

      const result = spawnSync(
        process.execPath,
        [patchPath],
        {
          cwd: root,
          encoding: "utf8",
        },
      );

      expect(result.status, result.stderr || result.stdout).toBe(0);

      const patchedRuntime = fs.readFileSync(tempRuntime, "utf8");
      expect(patchedRuntime).toContain('"canonical_story_lookup"');
      expect(patchedRuntime).toContain("canonicalStory.id");
      expect(patchedRuntime).toContain('phase=${phase}');

      const transpiled = ts.transpileModule(patchedRuntime, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
        },
        reportDiagnostics: true,
        fileName: "live-structure-intelligence/index.ts",
      });

      const syntaxErrors = (transpiled.diagnostics ?? []).filter(
        (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
      );

      expect(
        syntaxErrors.map((diagnostic) =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        ),
      ).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps the production deployment contract pinned to the canonical identity patch", () => {
    expect(deploy).toContain("canonical_story_lookup");
    expect(deploy).toContain("canonicalStory.id");
    expect(deploy).toContain("Apply deterministic runtime hardening patch");
  });
});
