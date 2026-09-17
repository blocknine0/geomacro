# Geomacro Website Lock

## Status

The published public website is **frozen** at the approved 2026-09-18 presentation baseline.

The lock exists so backend, API, data, agent-commerce, x402, database, security, and infrastructure work can continue without accidentally changing the public website presentation.

## Protected presentation surface

The guard blocks changes to:

- public website assets under `public/`
- `src/assets/**`
- `src/components/**`
- `src/content/**`
- `src/hooks/**`
- all UI route files under `src/routes/**/*.tsx`
- `src/router.tsx`
- `src/styles.css`
- root `styles.css`
- `vite.config.ts`
- `components.json`

The guard intentionally does **not** freeze API/server/data implementation files, so backend development can continue.

## Deployment safety

Two independent checks protect the published site:

1. **Website Lock CI** checks every pull request and every push to `main`.
2. **Lovable mirror sync** runs the same lock check before copying canonical `main` into the deployment mirror. If the website differs from the approved baseline, mirroring stops before the live deployment source changes.

## Intentional website changes

Do not edit the protected presentation surface as part of background/backend work.

A future intentional website change requires:

1. explicit founder approval;
2. a dedicated website change PR;
3. full Product CI, Hosting Alignment, CodeQL, and Website Lock review;
4. visual verification after publish;
5. only then, a dedicated baseline update.

Lovable AI edits and automatic “Fix” changes must not be used against the locked website.
