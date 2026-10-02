const RECOVERABLE_ASSET_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /chunkloaderror/i,
  /loading chunk .* failed/i,
  /failed to load module script/i,
  /unable to preload css/i,
];

const RELOAD_GUARD_PREFIX = "geomacro:asset-reload:";
const RELOAD_GUARD_WINDOW_MS = 60_000;

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error ?? "");
}

/**
 * Detect deployment/version-skew failures where an already-open browser tab
 * requests a hashed JS/CSS asset that disappeared after a new publish.
 */
export function isRecoverableClientAssetError(error: unknown): boolean {
  const text = errorText(error);
  return RECOVERABLE_ASSET_ERROR_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Claim a single hard-reload attempt for the current route. The short-lived
 * sessionStorage guard prevents reload loops when the underlying deployment is
 * genuinely unhealthy while allowing a later publish in the same tab to heal.
 */
export function claimClientAssetReload(error: unknown, now = Date.now()): boolean {
  if (typeof window === "undefined" || !isRecoverableClientAssetError(error)) return false;

  const key = `${RELOAD_GUARD_PREFIX}${window.location.pathname}`;
  try {
    const previous = Number(window.sessionStorage.getItem(key));
    if (Number.isFinite(previous) && previous > 0 && now - previous < RELOAD_GUARD_WINDOW_MS) {
      return false;
    }
    window.sessionStorage.setItem(key, String(now));
    return true;
  } catch {
    // If storage is unavailable, refuse automatic reload so a persistent error
    // cannot create an uncontrolled refresh loop. The visible retry button still
    // performs a user-initiated hard reload.
    return false;
  }
}
