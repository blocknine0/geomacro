#!/usr/bin/env node
// Private offline handoff only. No network, Telegram API, B2/D1, customer API,
// AI training, database mutation, x402 or signing side effects.
import { readFileSync, writeFileSync, realpathSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildInternalResearchReviewPacket } from "./verify-telegram-manual-research-review.mjs";

const repoRoot = realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));
function insideRepo(p) {
  const relative = path.relative(repoRoot, p);
  return relative === "" || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative));
}
function cliArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || !process.argv[idx + 1] || process.argv[idx + 1].startsWith("--")) {
    throw new Error("PRIVATE_RESEARCH_INPUT_OR_OUTPUT_REQUIRED");
  }
  return path.resolve(process.argv[idx + 1]);
}
try {
  if (process.argv.length !== 6 || !process.argv.includes("--input") || !process.argv.includes("--output")) {
    throw new Error("PRIVATE_RESEARCH_INPUT_OR_OUTPUT_REQUIRED");
  }
  const input = cliArg("--input");
  const output = cliArg("--output");
  const inputReal = realpathSync(input);
  const outParentReal = realpathSync(path.dirname(output));
  if (insideRepo(inputReal) || insideRepo(outParentReal) || inputReal === output || existsSync(output)) {
    throw new Error("RESEARCH_IO_MUST_BE_NEW_AND_OUTSIDE_REPOSITORY");
  }
  const data = JSON.parse(readFileSync(inputReal, "utf8"));
  const packet = buildInternalResearchReviewPacket(data);
  writeFileSync(output, JSON.stringify(packet, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  // Never print the input, Telegram hash, candidate URLs, or packet contents.
  process.stdout.write("PRIVATE_CORROBORATION_REVIEW_PACKET_CREATED_NOT_PUBLISHED\n");
} catch (e) {
  // Errors are constant codes. JSON parser/file system messages may contain
  // paths or content; never forward those to CI/stdout.
  const safe = e instanceof Error && /^[A-Z0-9_]{6,}$/.test(e.message)
    ? e.message : "PRIVATE_RESEARCH_PACKET_NOT_WRITTEN";
  process.stderr.write(safe + "\n");
  process.exitCode = 1;
}
