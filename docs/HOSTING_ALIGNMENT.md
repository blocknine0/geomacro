# Geomacro Hosting Alignment

## Source-of-truth contract

Geomacro uses three deliberately separated layers:

1. **GitHub `blocknine0/geomacro` `main`** is the application source authority. Code, routes, UI, server handlers, tests and deployment contracts are changed through reviewed GitHub branches and pull requests.
2. **External Supabase project `ldpwajisioljyjtojvfx`** is the production application database authority. Lovable Cloud or hosting-injected Supabase projects must never silently replace it.
3. **Lovable hosting** is the frontend/SSR hosting surface. The existing Lovable project is linked to the Lovable-created GitHub repository `blocknine0/geomacro-160c8e56`, so canonical `main` is mirrored one way into that repository before Lovable picks up the change.

This separation keeps `blocknine0/geomacro` as the permanent engineering source of truth while preserving the existing Lovable-hosted frontend without spending Lovable chat credits for normal product development.

## Why a mirror is required

Lovable's GitHub integration links a project to the repository created for that project. It does not import an arbitrary existing GitHub repository into the same Lovable project, and reconnecting creates a new repository instead of attaching the old project to `blocknine0/geomacro`.

Therefore the production-safe contract is intentionally one way:

`blocknine0/geomacro:main -> GitHub Actions mirror -> blocknine0/geomacro-160c8e56:main -> Lovable Git sync -> explicit Publish changes`

Changes must never be developed in the Lovable mirror and then treated as authoritative. If Lovable produces an edit, port it through a reviewed branch/PR in `blocknine0/geomacro` before it becomes permanent.

## Permanent automatic mirror

The workflow `.github/workflows/sync-lovable-main.yml` runs on every push to canonical `main` and can also be dispatched manually.

It:

- checks out canonical `blocknine0/geomacro`;
- clones the existing Lovable-linked repository `blocknine0/geomacro-160c8e56`;
- copies the canonical tree into the Lovable mirror;
- preserves mirror-only `.lovable/` metadata and mirror workflow files;
- writes `.geomacro-canonical-main` with the exact source commit SHA;
- commits only when the mirror actually differs;
- pushes the resulting snapshot to the mirror `main` branch.

The workflow deliberately excludes `.github/workflows/` from the copied tree so CI and privileged operational workflows run only in the canonical repository.

### One-time credential

Automatic cross-repository writes require one fine-grained GitHub token stored as the canonical repository Actions secret:

`LOVABLE_MIRROR_TOKEN`

Create the token with access only to `blocknine0/geomacro-160c8e56` and only the minimum repository permission needed for **Contents: Read and write**. Store it in `blocknine0/geomacro` under **Settings -> Secrets and variables -> Actions -> Repository secrets**.

Do not paste the token into source code, Lovable chat, issues, logs or screenshots.

If the secret is missing, the mirror workflow exits successfully with a notice and performs no cross-repository write. Canonical `main` remains authoritative.

## Zero-credit development path

Use this flow for normal changes:

1. Make code changes in `blocknine0/geomacro` through a branch/PR.
2. Let Product CI, CodeQL and **Hosting Alignment** pass.
3. Merge to canonical `main`.
4. `Sync Canonical Main to Lovable` mirrors the exact source tree into `blocknine0/geomacro-160c8e56:main`.
5. Lovable Git sync sees the new commit on its linked `main` branch automatically.
6. In Lovable, do **not** ask the chat agent to rewrite, sync or publish the project.
7. Open the normal **Publish** dialog and click **Publish changes**.
8. Run the live smoke workflow after publication.

Normal GitHub development and mirror sync do not consume Lovable chat credits.

Do not disconnect/reconnect the Lovable project merely to force a sync. That changes the repository relationship and is not the deployment mechanism for this project.

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
- missing canonical-to-Lovable mirror contract;
- incomplete hosted Supabase env documentation;
- browser-selected `VITE_SUPABASE_*` production data access;
- service-role use in the public read proxy;
- Risk Gate database access outside the authoritative Supabase project.

## Publishing incident rule

A Lovable **internal error** during chat or publishing is a hosting-platform incident, not a reason to edit production application code blindly. First confirm canonical GitHub CI/build is green, confirm the mirror workflow reached `blocknine0/geomacro-160c8e56:main`, then use Lovable's normal Git **Re-check** and **Publish changes** controls. Escalate to Lovable support only if its linked repository is current but the editor still refuses to sync or publish.
