# Supabase migration replay alignment

Production migration history contains several timestamped entries that were applied after dependent schema objects already existed. Clean zero-state replay runs timestamped migrations before the later 900-series migrations, so dependency-sensitive operations are deferred to replay-safe 9981-9984 migrations. Timestamped production entries remain as history markers and are not re-executed against production.

Remote-only timestamp versions are mirrored locally as no-op history markers so `supabase db push --dry-run` can compare local and remote histories without requesting destructive history repair.
