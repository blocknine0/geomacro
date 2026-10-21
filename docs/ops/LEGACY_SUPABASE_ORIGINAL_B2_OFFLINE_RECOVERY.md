# Recover one old Supabase Storage original without Supabase

This is an **offline disaster-recovery** tool for the 23,648 original files
already independently recovered and SHA256 verified in private Backblaze B2
([full verified run #39651599672](https://github.com/blocknine0/geomacro/actions/runs/39651599672)).
It does not use Supabase, D1, the internet, GitHub artifacts, buyer APIs or new paid infrastructure.

**Important:** It is NOT a production historical read service. It does not
authorize removing the old project's buckets or database while live callers,
testnet wallet/avatar writes, commercial entitlements and deployed Edge
functions have not migrated.

## Offline preparation

On an owner-controlled computer, obtain exactly three private files from
Backblaze bucket `geomacro-private-archive`, under prefix
`geomacro-evidence/v1/legacy-supabase-safe-exit/storage/`:

1. One `complete-<24-hex>.json` complete index with the certified SHA256 prefix
   `5eff883cadf814cd` from #39651599672.
2. The selected item's matching `part-0N-<24-hex>.verified.json`.
3. That same part's `part-0N-<24-hex>.tar.gz`.

The complete index is **private** and contains historical object names. Never
commit it or the bundle, upload either to GitHub Actions, or send either to
ChatGPT. Do not publish Backblaze storage credentials.

Calculate the **entire** index hash locally using `sha256sum complete-*.json`
on Linux/macOS or `Get-FileHash -Algorithm SHA256` on PowerShell. Confirm its
first sixteen hex characters are `5eff883cadf814cd`.

Run with Node.js 22+ on that owner-controlled computer:

```sh
node scripts/ops/legacy-b2-original-offline-recover.mjs \
  --index /private/complete-INDEX.json \
  --marker /private/part-00-INDEX.verified.json \
  --bundle /private/part-00-INDEX.tar.gz \
  --root-sha256 FULL_64_CHARACTER_ROOT_SHA256 \
  --bucket geomacro-live-intelligence \
  --object fragments/example-original.gz \
  --output /private/recovered-original.gz
```

Replace the example object with an **actual path in your own private index**,
and use the corresponding shard's marker and bundle. The program validates the
official index digest, shard manifest identity and object path, exact B2 bundle
digest, embedded original SHA256, original length, and tar path safety before
writing. It creates the output file using exclusive 0600 permissions and will
never overwrite an existing file or print contents.

If it reports `BLOCKED_NO_OUTPUT`, the untrusted or mismatching files must
not be treated as recovered.

## Acceptance boundaries

- Actual original bytes from both old Storage buckets were restored in B2 in
  verified production run #39651599672; the old Supabase project still contains
  the sources.
- The database snapshot has independently restored in PG17, but historical
  commercial, authentication and original Edge Function runtime cutover are not
  all production-accepted.
- This manual offline reader proves **cold recovery** without a Supabase
  account. It does NOT prove live Geomacro requests will work after deleting
  the old account.
- Never delete `storage.objects` directly by SQL. Any future source cleanup,
  *after* complete live cutover and explicit owner acceptance, must use the
  official Supabase Storage API and verify source absence.
