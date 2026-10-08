#!/usr/bin/env bash
set -euo pipefail

PRODUCT="${1:?product required}"
SOURCE_WORKFLOW="${2:?source workflow required}"
PROOF_SCHEMA="${3:?proof schema required}"
OUTPUT="${4:?output path required}"
REPO="${GITHUB_REPOSITORY:-blocknine0/geomacro}"

command -v gh >/dev/null 2>&1 || { echo "gh CLI is required" >&2; exit 2; }
command -v node >/dev/null 2>&1 || { echo "node is required" >&2; exit 2; }
command -v unzip >/dev/null 2>&1 || { echo "unzip is required" >&2; exit 2; }
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

case "$PRODUCT" in
  global-risk)
    ARTIFACT_NAME="gri-realtime-direct-postgres-$SOURCE_RUN_ID"
    ;;
  risk-indices)
    ARTIFACT_NAME="risk-indices-realtime-$SOURCE_RUN_ID"
    ;;
  intelligence)
    ARTIFACT_NAME="intelligence-current-$SOURCE_RUN_ID"
    ;;
  *)
    echo "Unsupported continuity product: $PRODUCT" >&2
    exit 4
    ;;
esac

ARTIFACTS_JSON="$(gh api "repos/$REPO/actions/runs/$SOURCE_RUN_ID/artifacts?per_page=100")"
ARTIFACT_ID="$(
  printf '%s' "$ARTIFACTS_JSON" |
    ARTIFACT_NAME="$ARTIFACT_NAME" node -e '
      let raw = "";
      process.stdin.on("data", (chunk) => raw += chunk);
      process.stdin.on("end", () => {
        const parsed = JSON.parse(raw || "{}");
        const matches = (parsed.artifacts ?? [])
          .filter((artifact) => artifact?.name === process.env.ARTIFACT_NAME && artifact?.expired !== true)
          .sort((a, b) => Date.parse(String(a?.created_at ?? "")) - Date.parse(String(b?.created_at ?? "")));
        const latest = matches.at(-1);
        process.stdout.write(latest?.id ? String(latest.id) : "");
      });
    '
)"
[[ "$ARTIFACT_ID" =~ ^[0-9]+$ ]] || {
  echo "No non-expired artifact named $ARTIFACT_NAME found for source run $SOURCE_RUN_ID" >&2
  exit 4
}

mkdir -p "$TMP_ROOT/artifacts"
gh api "repos/$REPO/actions/artifacts/$ARTIFACT_ID/zip" > "$TMP_ROOT/source-artifact.zip"
unzip -q "$TMP_ROOT/source-artifact.zip" -d "$TMP_ROOT/artifacts"

node scripts/ops/materialize-edge-continuity.mjs \
  --product "$PRODUCT" \
  --artifact-dir "$TMP_ROOT/artifacts" \
  --proof "$TMP_ROOT/source-publish-proof.json" \
  --source-run-id "$SOURCE_RUN_ID" \
  --output "$OUTPUT"

echo "Verified edge continuity prepared from successful main run $SOURCE_RUN_ID ($SOURCE_WORKFLOW), artifact $ARTIFACT_ID ($ARTIFACT_NAME)."
