import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ts from "typescript";

const implementationPath =
  "scripts/patch-live-structure-private-error-serializer.mjs";
const productionPatchPath =
  "scripts/patch-live-structure-runtime.mjs";
const runtimePath =
  "supabase/functions/live-structure-intelligence/index.ts";
const deployPath =
  ".github/workflows/deploy-live-structure-intelligence.yml";

const implementation = fs.readFileSync(implementationPath, "utf8");
const productionPatch = fs.readFileSync(productionPatchPath, "utf8");
const deploy = fs.readFileSync(deployPath, "utf8");

describe("live structure stable event identity", () => {
  it("resolves an exact canonical story before allocating a replacement event id", () => {
    expect(implementation).toContain('"canonical_story_lookup"');
    expect(implementation).toContain('"story_key"');
    expect(implementation).toContain(".maybeSingle()");
    expect(implementation).toContain("canonicalStory.id");
    expect(implementation).toContain("evidenceCount");
    expect(implementation).toContain("firstSeenAt");
    expect(implementation).toContain("sourceFamilies");
  });

  it("applies the exact production wrapper and forbids a line terminator after throw", () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "geomacro-live-structure-"),
    );

    try {
      const tempImplementation = path.join(root, implementationPath);
      const tempProductionPatch = path.join(root, productionPatchPath);
      const tempRuntime = path.join(root, runtimePath);

      fs.mkdirSync(path.dirname(tempImplementation), { recursive: true });
      fs.mkdirSync(path.dirname(tempRuntime), { recursive: true });
      fs.copyFileSync(implementationPath, tempImplementation);
      fs.copyFileSync(productionPatchPath, tempProductionPatch);
      fs.copyFileSync(runtimePath, tempRuntime);

      const result = spawnSync(
        process.execPath,
        [productionPatchPath],
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
      expect(patchedRuntime).not.toMatch(/\bthrow[ \t]*\r?\n/);
      expect(patchedRuntime.match(/throw canonicalStoryError;/g) ?? []).toHaveLength(1);

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

  it("keeps the production deployment contract pinned to the bundler-safe wrapper", () => {
    expect(productionPatch).toContain("invalidThrow");
    expect(productionPatch).toContain("throw canonicalStoryError;");
    expect(deploy).toContain("canonical_story_lookup");
    expect(deploy).toContain("canonicalStory.id");
    expect(deploy).toContain("Apply canonical bundler-safe runtime patch");
    expect(deploy).toContain("scripts/patch-live-structure-runtime.mjs");
  });
});
