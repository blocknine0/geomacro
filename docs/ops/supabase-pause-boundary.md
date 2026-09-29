# Supabase pause boundary

Geomacro is being moved away from Supabase as a production hard dependency in stages.

## Independent public reads already available

- Public Intelligence feed: private B2 live snapshot first, bounded Supabase fallback.
- Public Risk Indices: verified private B2 snapshot first, existing hosted fallbacks preserved.
- Public event detail and SEO: current B2 Intelligence snapshot first, Supabase only as a fallback for older/non-snapshot events.
- Ask Geomacro permanent reader: B2 live Intelligence snapshot first. Fresh/time-sensitive questions remain on the ephemeral live engine and do not require durable live storage writes.

## Still Supabase-dependent

Do not intentionally pause Supabase until these write/state paths have an independent replacement and have passed pause simulation:

- x402/agent commerce request and payment ledgers.
- account/session/profile state where Supabase Auth or database state is still used.
- ingestion pipelines that currently materialize canonical structured state in Supabase.
- admin/audit/reconciliation jobs that require Supabase tables.

## Safety rule

Supabase is optional only for a path after the path has an independently verified non-Supabase implementation. Never delete or externalize a canonical row merely because a B2 snapshot exists. Archive/readback verification must precede any source deletion.
