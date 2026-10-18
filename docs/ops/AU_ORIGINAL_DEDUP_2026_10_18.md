# Australian original-source PR reconciliation

Current main already implements Australian Resources Minister original HTML index retrieval for Macro and Critical Minerals, same-host article heading/date readback, bounded transport diagnostics, and unscored derived output. These supersede the original PR #2138 RSS replacement and diagnostic workflow. No RSS endpoint is reactivated by this reconciliation.

The remaining defect was cross-lane delivery identity: the same original URL admitted through a minister RSS lane and the Resources HTML index could appear twice because public IDs include the lane. Deduplication now uses category plus exact admitted original URL, after native-clock/topic validation. Public IDs still use the previous selected-lane fingerprint; no stored ID is rewritten. Distinct URLs remain separate; one relevant original can serve two different categories. A rejected future occurrence does not suppress a valid occurrence.

This is a duplicate-suppression code fix, not new source transport, live news freshness, independent corroboration, commercial rights, score or paid-product acceptance. Source raw content remains private; no B2/Supabase writes, paid API or payment is introduced.
