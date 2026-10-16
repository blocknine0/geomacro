# Original GRI immutable version recovery

The existing D1 anchor contains the original compressed and restored payload SHA-256, but its `latest.json.gz` name is mutable. Re-reading the current object cannot recover a prior baseline. The new read-only operator resolves one retained B2 file version without changing that trusted anchor.

The protected runner supplies only the existing dedicated archive-read credential, not the B2 writer. It first verifies the existing authenticated D1 pin and original archive clock. It then reserves every B2 operation through the existing shared D1 governor: one native authorization, optionally one exact-bucket lookup, one bounded version-metadata page, and at most one version download. Total maximum four attempts; no retry, credential switching, pagination or search over downloaded candidates. Class-C metadata reads conservatively consume shared GET tickets. The quota ledger is intentionally updated; the receipt distinguishes these reservations from zero D1 product writes and does not claim zero total D1 writes. Existing limits are unchanged.

A single version at the exact old object name/bucket and archive-generation window must be unambiguous. Its downloaded file ID, filename and length must match metadata, and its actual compressed SHA256 and restored payload SHA256 must match the PRE-EXISTING D1 anchor. A candidate timestamp is only a locator, never proof. Missing/ambiguous metadata, unauthorized capabilities, denial, quota hold, unexpected endpoint, corrupt bytes or changed hashes fail closed.

The existing 30-day historical bound and native snapshot clock stay intact. A matching retained object proves an immutable original file version was read; it does not prove a complete multi-snapshot historical lineage, current GRI, source rights, GRO coverage or paid readiness. No B2 PUT, public hot promotion, raw-content persistence, Supabase or payment occurs. Only a sanitized metadata receipt is retained.

The protected workflow has no schedule. Its narrowly scoped main push canary and explicit operator dispatch run the same four-operation maximum under the existing historical-recovery concurrency group. The prior metadata-only workflow keeps its original policy unchanged.

Official protocol references: https://www.backblaze.com/apidocs/b2-authorize-account ; https://www.backblaze.com/apidocs/b2-list-file-versions ; https://www.backblaze.com/apidocs/b2-download-file-by-id
