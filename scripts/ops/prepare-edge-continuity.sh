#!/usr/bin/env bash
set -euo pipefail

PRODUCT="${1:?product required}"
SOURCE_WORKFLOW="${2:?source workflow required}"
PROOF_SCHEMA="${3:?proof schema required}"
OUTPUT="${4:?output path required}"
REPO="${GITHUB_REPOSITORY:-blocknine0/geomacro}"

command -v gh >/dev/null 2>&1 || { echo "gh CLI is required" >&2; exit 2; }
command -v node >/dev/null 2>&1 || { echo "node is required" >&2; exit 2; }
test -n "${GH_TOKEN:-}" || { echo "GH_TOKEN is required" >&2; exit 2; }

SOURCE_RUN_ID="${SOURCE_RUN_ID:-}"
if [[ -z "$SOURCE_RUN_ID" ]]; then
  SOURCE_RUN_ID="$(gh api "repos/$REPO/actions/workflows/$SOURCE_WORKFLOW/runs?branch=main&status=success&per_page=1" --jq '.workflow_runs[0].id // empty')"
fi
[[ "$SOURCE_RUN_ID" =~ ^[0-9]+$ ]] || { echo "No successful source run found for $SOURCE_WORKFLOW" >&2; exit 3; }

SOURCE_HEAD="$(gh api "repos/$REPO/actions/runs/$SOURCE_RUN_ID" --jq '.head_branch + ":" + (.conclusion // "")')"
[[ "$SOURCE_HEAD" == "main:success" ]] || { echo "Source run is not a successful main run: $SOURCE_HEAD" >&2; exit 3; }

TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

gh run view "$SOURCE_RUN_ID" --repo "$REPO" --log > "$TMP_ROOT/source.log"
node - "$TMP_ROOT/source.log" "$PROOF_SCHEMA" "$TMP_ROOT/source-publish-proof.json" <<'NODE'
const fs = require("fs");
const [logPath, schema, outPath] = process.argv.slice(2);
const lines = fs.readFileSync(logPath, "utf8").split(/\r?\n/);
let proof = null;
for (const line of lines) {
  const start = line.indexOf("{");
  if (start < 0) continue;
  const candidate = line.slice(start).trim();
  try {
    const value = JSON.parse(candidate);
    if (value?.schema === schema && value?.ok === true) proof = value;
  } catch {}
}
if (!proof) throw new Error("EDGE_CONTINUITY_SOURCE_PROOF_NOT_FOUND");
if (
  proof.b2_readback_verified !== true ||
  proof.destructive_change !== false ||
  proof.synthetic_score === true ||
  proof.synthetic_history === true ||
  proof.synthetic_current_score === true
) throw new Error("EDGE_CONTINUITY_SOURCE_PROOF_REJECTED");
fs.writeFileSync(outPath, JSON.stringify(proof, null, 2) + "\n");
NODE

mkdir -p "$TMP_ROOT/artifacts"
gh run download "$SOURCE_RUN_ID" --repo "$REPO" --dir "$TMP_ROOT/artifacts"

node scripts/ops/materialize-edge-continuity.mjs \
  --product "$PRODUCT" \
  --artifact-dir "$TMP_ROOT/artifacts" \
  --proof "$TMP_ROOT/source-publish-proof.json" \
  --source-run-id "$SOURCE_RUN_ID" \
  --output "$OUTPUT"

echo "Verified edge continuity prepared from successful main run $SOURCE_RUN_ID ($SOURCE_WORKFLOW)."
