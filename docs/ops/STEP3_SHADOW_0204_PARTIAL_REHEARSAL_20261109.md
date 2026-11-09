# GeoMacro Step3 — physically observed Shadow 0204 partial rehearsal, 2026-11-09

## Provider evidence

Protected [run #42595314318](https://github.com/blocknine0/geomacro/actions/runs/42595314318) ran under exact reviewed main SHA `9cbe718dcbb70b106f1da2f9bd7fa910ba66fa79`. All of these were **physical receipts**, not claims:
- reviewed SHA / Shadow private binding preflight PASS;
- Cloudflare Workers Paid account-wide month headroom PASS;
- actual Shadow D1 identity PASS;
- provider Time Travel bookmark encrypted into private R2, signed manifest written, provider readback PASS;
- protected D1 migration ledger created/readback PASS;
- Cloudflare native 0204 migration **applied on Shadow**, but `verified: []` and `code: STEP3_PROVIDER_OR_COMMAND_UNAVAILABLE` stopped the rehearsal **before verified receipt**.
- No production SQL, no protected canary move, no payments; Stage2 and Hot50 jobs skipped.

The Shadow artifact was a syntactically invalid JSON document: `writeFileSync(...+"\\n")` emitted a literal backslash-n after the signed document. Strict `JSON.parse` fails with `Extra data`. The signed document reported `NOT_YET_VERIFIED`, correctly, but its serialization was defective. Fixed source to write a real newline, preserving Ed25519 attestation and fail-closed semantics.

## Root-cause investigation, no unsafe replay

The generic catch in `run()` discarded the failing Wrangler subcommand, process exit type and stage. The 0204 native DDL may have succeeded already; blindly rerunning or calling the remaining migrations is not permitted before native migration history, exact schema/index presence, D1 ledger checksum and full integrity are reconciled.

This change adds:
- only allowlisted non-sensitive Wrangler command names / exit kinds, not raw error strings, stderr, SQL text, bearer, account ID or response bodies;
- exact 0204 migration progress / schema-index-integrity checkpoint inside the signed **failure** receipt;
- an opt-in automatic **read-only main-push** physical diagnostic after the reviewed PR merges, with seven *fixed SELECT/EXPLAIN/PRAGMA integrity_check* queries against **Shadow only**, after renewed Cloudflare paid monthly headroom proof. It never applies migrations or uses production SQL and never advertises read-only observations as Stage1 PASS;
- isolated contract tests and retained workflow inventory.

Provider [Cloudflare D1 SQL docs](https://developers.cloudflare.com/d1/sql-api/sql-statements/) explicitly document `PRAGMA quick_check` but not `PRAGMA integrity_check`. The diagnostic probes the original exact full-integrity command; the script never silently substitutes weaker `quick_check`, because the owner requires physical index/tree integrity proof. A provider rejection must remain HOLD and require a verified equivalent, not a skipped safety check.

## Follow-up gate

Inspect the auto-run artifact `geomacro-step3-shadow-0204-readonly-<run_id>`. If native 0204 history is committed while the protected ledger remains STARTED, the next exact-main Shadow rehearsal must reconcile safely via its existing `decideResume` mechanism after genuine schema/integrity evidence. If provider full-integrity is unavailable, design and independently verify a proof of equivalent strength before resuming. No production canary or production migrations until full signed Stage1 acceptance.
