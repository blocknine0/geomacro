/** Server-only authenticated read path for the B2 gateway. */
export async function readB2GatewayObject(key: string, maxBytes: number, timeoutMs = 10_000): Promise<Uint8Array | null> {
  if (typeof window !== "undefined" || typeof process === "undefined") return null;
  const gateway = String(process.env.B2_GATEWAY_URL ?? "").trim();
  const token = String(process.env.INTERNAL_GATEWAY_TOKEN ?? "").trim();
  if (process.env.B2_STORAGE_MODE !== "gateway") return null;
  if (!gateway || token.length < 32) throw new Error("B2_GATEWAY_CONFIG_REQUIRED");
  if (!/^geomacro-evidence\/v1\/[A-Za-z0-9_./-]+$/.test(key) || key.includes("..")) {
    throw new Error("B2_GATEWAY_KEY_INVALID");
  }
  const endpoint = new URL("/v1/internal/objects", gateway);
  if (endpoint.protocol !== "https:") throw new Error("B2_GATEWAY_ENDPOINT_INVALID");
  endpoint.searchParams.set("path", key);
  const response = await fetch(endpoint, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`B2_GATEWAY_READ_${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.byteLength > maxBytes) throw new Error("B2_GATEWAY_SIZE_INVALID");
  return bytes;
}
