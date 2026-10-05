const DENO_ENV_GET_PATTERN = /\bDeno\.env\.get\(\s*["']([A-Z0-9_]+)["']\s*,?\s*\)/g;
const DENO_REFERENCE_PATTERN = /\bDeno\.[A-Za-z_$][A-Za-z0-9_$]*/g;

export function rewriteDenoEnvGets(source) {
  return String(source ?? "").replace(
    DENO_ENV_GET_PATTERN,
    (_match, name) => `process.env.${name}`,
  );
}

export function findRemainingDenoReferences(source) {
  return [
    ...new Set(
      [...String(source ?? "").matchAll(DENO_REFERENCE_PATTERN)]
        .map((match) => match[0]),
    ),
  ].sort();
}
