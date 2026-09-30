# Fragment B2 recovery

This runbook preserves the immutable live fragment manifest and never deletes `storage.objects` through SQL.

1. Run `Fragment B2 Archive Canary`. It archives exactly one fragment, verifies the source hash and B2 readback, writes the immutable sidecar, and leaves the Supabase Storage source intact.
2. Run `Fragment B2 Auto Restore Canary`. It selects the latest archived pointer, verifies B2 bytes against the canonical hash, and verifies the existing Supabase source is byte-identical. If the source is absent, the restore tool restores it and verifies the post-upload readback.
3. Only after step 2 succeeds, run `Fragment B2 Verified Cleanup` with confirmation `VERIFIED_RESTORE_PASSED`. The existing offload tool still independently requires a verified archive pointer, fully handled fragment records, Storage API removal, and deterministic source-absence proof before recording deletion.
4. Re-measure database size and repeat in small batches. Stop immediately on any hash, readback, pointer, handled-count, removal, absence, or restore mismatch.

The archive-only and restore workflows are non-destructive. The cleanup workflow is deliberately manual and single-fragment until the canary sequence proves the path end-to-end.
