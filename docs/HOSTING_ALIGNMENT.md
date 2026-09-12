# Geomacro Hosting Alignment

## Source-of-truth contract

Geomacro uses three deliberately separated layers:

1. **GitHub `main`** is the application source authority. Code, routes, UI, server handlers, tests and deployment contracts are changed through reviewed GitHub branches and pull requests.
2. **External Supabase project `ldpwajisioljyjtojvfx`** is the production application database authority. Lovable Cloud or hosting-injected Supabase projects must never silently replace it.
3. **Lovable hosting** is the frontend/SSR hosting surface. Lovable Git sync follows the active GitHub branch, while publishing remains an explicit deployment step.

This separation lets Geomacro keep the Lovable-hosted frontend experience without spending Lovable build-chat credits for normal product development.

## Zero-credit development path

Use this flow for normal changes:

1. Make code changes in GitHub through a branch/PR.
2. Let Product CI, CodeQL and **Hosting Alignment** pass.
3. Merge to `main`.
4. Lovable Git sync picks up the active `main` branch automatically.
5. In Lovable, do **not** ask the chat agent to rewrite, sync or publish the project.
6. Open the normal **Publish** dialog and click **Publish changes**. Publishing from the dialog is the deployment action and does not require Lovable chat usage.
7. Run the live smoke workflow after publication.

Do not disconnect/reconnect the project repository merely to force a sync. Repository reconnection can change the linked repository relationship and is not a normal deployment operation.

## Supabase runtime contract

Hosted SSR/API runtime:

- `APP_SUPABASE_URL`
- `APP_SUPABASE_ANON_KEY`
- `APP_SUPABASE_SERVICE_ROLE_KEY`

Trusted GitHub Actions / ingestion / operations:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The application and trusted-operation URLs must resolve to project ref `ldpwajisioljyjtojvfx` for production operations.

`VITE_SUPABASE_*` is not a production database selector. Browser public reads use the same-origin `/api/public-data-proxy` and never rely on hosting-injected Supabase credentials.

## Frontend boundary

`src/lib/supabase-feed.ts` preserves the Supabase query-builder API for older UI callers but routes allowed GET/HEAD PostgREST operations to `/api/public-data-proxy`. Direct browser writes, auth/storage use and realtime through this client fail closed.

This keeps frontend behavior stable even if a host injects unrelated `VITE_SUPABASE_*` variables.

## Backend boundary

- `src/lib/supabase-app.server.ts` handles application server access.
- `src/lib/risk-supabase.server.ts` is service-role-only, has a hard timeout, and accepts only the authoritative production project for Risk Object/Risk Gate infrastructure.
- privileged diagnostic scripts use only server-side `SUPABASE_*` / `APP_SUPABASE_*` credentials.

No service-role key may be exposed in browser code or through the public read proxy.

## Permanent guard

Run locally or in CI:

```bash
bun run hosting:verify
```

The `Hosting Alignment` workflow also runs this check, the public-data boundary test, and a production build for relevant pull requests and pushes to `main`.

The guard fails if the repository drifts back toward:

- npm lockfile ambiguity;
- missing Lovable-compatible Vite build configuration;
- incomplete hosted Supabase env documentation;
- browser-selected `VITE_SUPABASE_*` production data access;
- service-role use in the public read proxy;
- Risk Gate database access outside the authoritative Supabase project.

## Publishing incident rule

A Lovable **internal error** during chat or publishing is a hosting-platform incident, not a reason to edit production application code blindly. First confirm GitHub CI/build is green and the project is synced to `main`. Retry the normal Publish dialog later or escalate the project link to Lovable support if the internal error persists.
