#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
ARTIFACT_DIR="${ARTIFACT_DIR:-artifacts/postgres-concurrency}"
mkdir -p "$ARTIFACT_DIR"/provision "$ARTIFACT_DIR"/exact "$ARTIFACT_DIR"/mutated "$ARTIFACT_DIR"/quota

psql_value() {
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc "$1"
}

wait_all() {
  local failed=0
  local pid
  for pid in "$@"; do
    if ! wait "$pid"; then
      failed=1
    fi
  done
  return "$failed"
}

count_exact() {
  local expected="$1"
  shift
  awk -v expected="$expected" '$0 == expected { count += 1 } END { print count + 0 }' "$@"
}

# 1) Fifty simultaneous first requests for the same principal. Before the
# principal-scoped advisory lock, the missing-row path can race the unique
# (principal_type, principal_id) insert. Every caller must now succeed and all
# calls must converge on exactly one account.
pids=()
for i in $(seq 1 50); do
  quota=100
  if (( i % 2 == 0 )); then quota=200; fi
  (
    psql_value "select (public.ensure_commercial_credit_account('api_client','concurrency-provision','api_pilot','credits-v1.1.0',$quota,30))->>'account_id';" \
      > "$ARTIFACT_DIR/provision/$i.txt"
  ) &
  pids+=("$!")
done
wait_all "${pids[@]}"

provision_rows="$(psql_value "select count(*) from public.commercial_credit_accounts where principal_type='api_client' and principal_id='concurrency-provision';")"
provision_quota="$(psql_value "select included_credits from public.commercial_credit_accounts where principal_type='api_client' and principal_id='concurrency-provision';")"
provision_distinct_ids="$(cat "$ARTIFACT_DIR"/provision/*.txt | sort -u | wc -l | tr -d ' ')"

# 2) Fifty simultaneous exact calls with one request id. Exactly one debit must
# be new; the other 49 calls must be idempotent replays after row-lock serialization.
pids=()
for i in $(seq 1 50); do
  (
    psql_value "select (public.consume_commercial_credits('api_client','concurrency-provision','race-request-0001','signed_risk_object',10,'credits-v1.1.0'))->>'idempotent_replay';" \
      > "$ARTIFACT_DIR/exact/$i.txt"
  ) &
  pids+=("$!")
done
wait_all "${pids[@]}"

exact_new="$(count_exact false "$ARTIFACT_DIR"/exact/*.txt)"
exact_replays="$(count_exact true "$ARTIFACT_DIR"/exact/*.txt)"
exact_credits_used="$(psql_value "select credits_used from public.commercial_credit_accounts where principal_type='api_client' and principal_id='concurrency-provision';")"
exact_usage_rows="$(psql_value "select count(*) from public.commercial_credit_usage u join public.commercial_credit_accounts a on a.id=u.account_id where a.principal_type='api_client' and a.principal_id='concurrency-provision';")"

# 3) Mutating the already-bound request id must fail for every concurrent retry
# and must not change either the debit or immutable usage row.
pids=()
for i in $(seq 1 20); do
  (
    psql_value "select (public.consume_commercial_credits('api_client','concurrency-provision','race-request-0001','risk_gate_bundle',15,'credits-v1.1.0'))->>'code';" \
      > "$ARTIFACT_DIR/mutated/$i.txt"
  ) &
  pids+=("$!")
done
wait_all "${pids[@]}"

mutated_conflicts="$(count_exact IDEMPOTENCY_CONFLICT "$ARTIFACT_DIR"/mutated/*.txt)"
mutated_credits_used="$(psql_value "select credits_used from public.commercial_credit_accounts where principal_type='api_client' and principal_id='concurrency-provision';")"
mutated_usage_rows="$(psql_value "select count(*) from public.commercial_credit_usage u join public.commercial_credit_accounts a on a.id=u.account_id where a.principal_type='api_client' and a.principal_id='concurrency-provision';")"

# 4) Twenty unique 10-credit requests race against a 100-credit account. The
# row lock must admit exactly ten, reject exactly ten before overdraft, and
# leave durable usage exactly equal to the account debit.
psql_value "select public.ensure_commercial_credit_account('api_client','quota-race-client','api_pilot','credits-v1.1.0',100,30);" >/dev/null
pids=()
for i in $(seq 1 20); do
  (
    psql_value "select coalesce((public.consume_commercial_credits('api_client','quota-race-client','quota-request-$(printf '%04d' "$i")','risk_gate_bundle',10,'credits-v1.1.0'))->>'code','OK');" \
      > "$ARTIFACT_DIR/quota/$i.txt"
  ) &
  pids+=("$!")
done
wait_all "${pids[@]}"

quota_success="$(count_exact OK "$ARTIFACT_DIR"/quota/*.txt)"
quota_rejected="$(count_exact INSUFFICIENT_CREDITS "$ARTIFACT_DIR"/quota/*.txt)"
quota_credits_used="$(psql_value "select credits_used from public.commercial_credit_accounts where principal_type='api_client' and principal_id='quota-race-client';")"
quota_usage_rows="$(psql_value "select count(*) from public.commercial_credit_usage u join public.commercial_credit_accounts a on a.id=u.account_id where a.principal_type='api_client' and a.principal_id='quota-race-client';")"

ok=true
[[ "$provision_rows" == "1" ]] || ok=false
[[ "$provision_quota" == "200" ]] || ok=false
[[ "$provision_distinct_ids" == "1" ]] || ok=false
[[ "$exact_new" == "1" ]] || ok=false
[[ "$exact_replays" == "49" ]] || ok=false
[[ "$exact_credits_used" == "10" ]] || ok=false
[[ "$exact_usage_rows" == "1" ]] || ok=false
[[ "$mutated_conflicts" == "20" ]] || ok=false
[[ "$mutated_credits_used" == "10" ]] || ok=false
[[ "$mutated_usage_rows" == "1" ]] || ok=false
[[ "$quota_success" == "10" ]] || ok=false
[[ "$quota_rejected" == "10" ]] || ok=false
[[ "$quota_credits_used" == "100" ]] || ok=false
[[ "$quota_usage_rows" == "10" ]] || ok=false

cat > "$ARTIFACT_DIR/report.json" <<JSON
{
  "ok": $ok,
  "database": "isolated_postgresql_16_ci",
  "provisioning_race": {
    "concurrent_calls": 50,
    "account_rows": $provision_rows,
    "distinct_account_ids_returned": $provision_distinct_ids,
    "final_included_credits": $provision_quota
  },
  "exact_request_race": {
    "concurrent_calls": 50,
    "new_debits": $exact_new,
    "idempotent_replays": $exact_replays,
    "credits_used": $exact_credits_used,
    "usage_rows": $exact_usage_rows
  },
  "mutated_replay_race": {
    "concurrent_calls": 20,
    "idempotency_conflicts": $mutated_conflicts,
    "credits_used_after": $mutated_credits_used,
    "usage_rows_after": $mutated_usage_rows
  },
  "quota_exhaustion_race": {
    "concurrent_calls": 20,
    "successful_debits": $quota_success,
    "insufficient_credit_rejections": $quota_rejected,
    "credits_used": $quota_credits_used,
    "usage_rows": $quota_usage_rows,
    "quota": 100
  },
  "boundaries": {
    "production_database_touched": false,
    "real_payment_attempted": false,
    "execution_authorized": false
  }
}
JSON

cat "$ARTIFACT_DIR/report.json"
[[ "$ok" == "true" ]]
