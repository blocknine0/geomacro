/**
 * Fail-closed, bounded streaming read for payable HTTP JSON envelopes.
 * Declared Content-Length is only a hint: enforce the cap on actual bytes
 * before allocating the complete body. The same max applies to chunked input.
 */
export const MAX_COMMERCIAL_REQUEST_BODY_BYTES = 8192 as const;

export async function readBoundedCommercialBody(
  request: Request,
  limit: number = MAX_COMMERCIAL_REQUEST_BODY_BYTES,
): Promise<string> {
  if (!Number.isSafeInteger(limit) || limit < 1 ||
      limit > MAX_COMMERCIAL_REQUEST_BODY_BYTES) {
    throw new Error("COMMERCIAL_REQUEST_LIMIT_INVALID");
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > limit) {
        // Never buffer the overflow or attempt payment processing. Cancelling
        // may race an already-closed network stream; no retry is attempted.
        void reader.cancel("COMMERCIAL_REQUEST_BODY_TOO_LARGE").catch(() => undefined);
        throw new Response(
          JSON.stringify({ ok: false, error: { code: "COMMERCIAL_REQUEST_BODY_TOO_LARGE" } }),
          { status: 413, headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          } },
        );
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
}
