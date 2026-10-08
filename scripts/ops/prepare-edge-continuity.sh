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
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

artifact_name_for_run() {
  local run_id="$1"
  case "$PRODUCT" in
    global-risk)
      printf 'gri-realtime-direct-postgres-%s' "$run_id"
      ;;
    risk-indices)
      printf 'risk-indices-realtime-%s' "$run_id"
      ;;
    intelligence)
      printf 'intelligence-current-%s' "$run_id"
      ;;
    *)
      echo "Unsupported continuity product: $PRODUCT" >&2
      return 4
      ;;
  esac
}

try_candidate() {
  local run_id="$1"
  local candidate_dir="$TMP_ROOT/$run_id"
  local source_head artifact_name artifacts_json artifact_id

  [[ "$run_id" =~ ^[0-9]+$ ]] || return 1
  source_head="$(gh api "repos/$REPO/actions/runs/$run_id" --jq '.head_branch + ":" + (.conclusion // "")' 2>/dev/null || true)"
  [[ "$source_head" == "main:success" ]] || return 1

  mkdir -p "$candidate_dir/artifacts"
  gh run view "$run_id" --repo "$REPO" --log > "$candidate_dir/source.log" 2>/dev/null || return 1

  if ! node - "$candidate_dir/source.log" "$PROOF_SCHEMA" "$candidate_dir/source-publish-proof.json" <<'NODE'
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
if (!proof) process.exit(2);
if (
  proof.b2_readback_verified !== true ||
  proof.destructive_change !== false ||
  proof.synthetic_score === true ||
  proof.synthetic_history === true ||
  proof.synthetic_current_score === true
) process.exit(3);
fs.writeFileSync(outPath, JSON.stringify(proof, null, 2) + "\n");
NODE
  then
    return 1
  fi

  artifact_name="$(artifact_name_for_run "$run_id")" || return 1
  artifacts_json="$(gh api "repos/$REPO/actions/runs/$run_id/artifacts?per_page=100" 2>/dev/null || true)"
  artifact_id="$(
    printf '%s' "$artifacts_json" |
      ARTIFACT_NAME="$artifact_name" node -e '
        let raw = "";
        process.stdin.on("data", (chunk) => raw += chunk);
        process.stdin.on("end", () => {
          let parsed = {};
          try { parsed = JSON.parse(raw || "{}"); } catch {}
          const matches = (parsed.artifacts ?? [])
            .filter((artifact) => artifact?.name === process.env.ARTIFACT_NAME && artifact?.expired !== true)
            .sort((a, b) => Date.parse(String(a?.created_at ?? "")) - Date.parse(String(b?.created_at ?? "")));
          const latest = matches.at(-1);
          process.stdout.write(latest?.id ? String(latest.id) : "");
        });
      '
  )"
  [[ "$artifact_id" =~ ^[0-9]+$ ]] || return 1

  gh api "repos/$REPO/actions/artifacts/$artifact_id/zip" > "$candidate_dir/source-artifact.zip" 2>/dev/null || return 1
  unzip -q "$candidate_dir/source-artifact.zip" -d "$candidate_dir/artifacts" || return 1

  if ! node scripts/ops/materialize-edge-continuity.mjs \
    --product "$PRODUCT" \
    --artifact-dir "$candidate_dir/artifacts" \
    --proof "$candidate_dir/source-publish-proof.json" \
    --source-run-id "$run_id" \
    --output "$candidate_dir/continuity.mjs" >/dev/null 2>&1
  then
    return 1
  fi

  mkdir -p "$(dirname "$OUTPUT")"
  mv "$candidate_dir/continuity.mjs" "$OUTPUT"
  printf '%s\n' "$run_id" > "$TMP_ROOT/selected-run-id"
  printf '%s\n' "$artifact_id" > "$TMP_ROOT/selected-artifact-id"
  printf '%s\n' "$artifact_name" > "$TMP_ROOT/selected-artifact-name"
  return 0
}

if [[ -n "$SOURCE_RUN_ID" ]]; then
  CANDIDATE_RUN_IDS="$SOURCE_RUN_ID"
else
  CANDIDATE_RUN_IDS="$(
    gh api "repos/$REPO/actions/workflows/$SOURCE_WORKFLOW/runs?branch=main&status=success&per_page=50" \
      --jq '.workflow_runs[].id'
  )"
fi

SELECTED_RUN_ID=""
while IFS= read -r candidate_run_id; do
  [[ -n "$candidate_run_id" ]] || continue
  if try_candidate "$candidate_run_id"; then
    SELECTED_RUN_ID="$candidate_run_id"
    break
  fi
  if [[ -n "$SOURCE_RUN_ID" ]]; then
    break
  fi
done <<< "$CANDIDATE_RUN_IDS"

[[ "$SELECTED_RUN_ID" =~ ^[0-9]+$ ]] || {
  echo "No coherent B2-readback-verified continuity source found for $SOURCE_WORKFLOW / $PROOF_SCHEMA" >&2
  exit 3
}

ARTIFACT_ID="$(cat "$TMP_ROOT/selected-artifact-id")"
ARTIFACT_NAME="$(cat "$TMP_ROOT/selected-artifact-name")"
echo "Verified edge continuity prepared from coherent successful main run $SELECTED_RUN_ID ($SOURCE_WORKFLOW), artifact $ARTIFACT_ID ($ARTIFACT_NAME)."
