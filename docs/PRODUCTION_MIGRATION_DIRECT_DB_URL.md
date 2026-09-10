# Production migration direct database fallback

The authoritative Geomacro production migration workflow can use a direct PostgreSQL connection string instead of `supabase link`.

This exists because scoped Supabase Personal Access Tokens can be valid for the project and capabilities yet still fail the CLI Management API linking path. Database migrations themselves do not require the Management API when the Supabase CLI is given `--db-url`.

## Required production environment secrets

- `SUPABASE_PROJECT_ID`: must remain `ldpwajisioljyjtojvfx`.
- `SUPABASE_DB_URL`: the authoritative project's PostgreSQL connection URL. Prefer the **Session pooler** connection string from the Supabase project **Connect** dialog for GitHub-hosted runners. The URL must include the percent-encoded database password.

The workflow accepts only either:

- direct host `db.ldpwajisioljyjtojvfx.supabase.co` with username `postgres`, or
- a Supabase pooler host ending in `.pooler.supabase.com` with username `postgres.ldpwajisioljyjtojvfx`.

It refuses any other database identity before running a migration command.

## Safety

- workflow dispatch from `main` only;
- `plan` is the default mode;
- `supabase db push --db-url ... --dry-run` always runs before any apply;
- `apply` is explicit and manual;
- no Edge Function deployment or secret synchronization;
- connection URL is never printed;
- the production environment remains the concurrency/protection boundary.

Do not paste the database URL or password into chat, issues, logs, or repository files. Store it only as the GitHub `production` environment secret `SUPABASE_DB_URL`.
