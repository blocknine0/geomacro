export const PUBLIC_DATA_REQUEST_TIMEOUT_MS = 10_000;
export const PUBLIC_ASK_REQUEST_TIMEOUT_MS = 25_000;

/**
 * Bound browser/server-function waits so a stalled transport cannot leave a
 * public Geomacro surface in an indefinite loading state.
 *
 * The underlying request may still finish later, but this wrapper settles once
 * and callers can render their existing fail-closed unavailable state.
 */
export async function withPublicRuntimeTimeout<T>(
  operation: Promise<T>,
  timeoutMs = PUBLIC_DATA_REQUEST_TIMEOUT_MS,
  message = "Public runtime request timed out.",
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
