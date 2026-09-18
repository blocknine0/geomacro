import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { consumeFomcScopedProofArtifact } from "../../src/lib/fomc-scoped-proof-consumer";

function argValue(name: string) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function main() {
  const inputArg = argValue("--input");
  const outputArg = argValue("--output");
  if (!inputArg) {
    throw new Error(
      "usage: bun scripts/early-warning/consume-fomc-scoped-proof.ts --input <artifact.json> [--output <metrics.json>]",
    );
  }

  const inputPath = resolve(inputArg);
  if (!existsSync(inputPath)) throw new Error(`input artifact not found: ${inputPath}`);
  const raw = JSON.parse(readFileSync(inputPath, "utf8")) as unknown;
  const result = consumeFomcScopedProofArtifact(raw);

  const boundedOutput = {
    schema_version: "geomacro.fomc-scoped-proof-metrics.v1",
    source_artifact_hash: result.source_artifact_hash,
    scope: result.scope,
    metrics: result.metrics,
    publication_readiness: result.publication_readiness,
    scope_publication_allowed: false,
    public_performance_claims_allowed: false,
    commercial_signal_activation: false,
    market_price_prediction: false,
    raw_samples_included: false,
  } as const;

  const serialized = `${JSON.stringify(boundedOutput, null, 2)}\n`;
  if (outputArg) {
    const outputPath = resolve(outputArg);
    if (existsSync(outputPath)) {
      throw new Error(`refusing to overwrite existing output artifact: ${outputPath}`);
    }
    writeFileSync(outputPath, serialized, { encoding: "utf8", flag: "wx" });
    console.log(
      JSON.stringify({
        status: "ok",
        output: outputPath,
        source_artifact_hash: result.source_artifact_hash,
        publishable: result.publication_readiness.publishable,
      }),
    );
    return;
  }

  process.stdout.write(serialized);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`FOMC scoped proof consumption failed: ${message}`);
  process.exitCode = 1;
}
