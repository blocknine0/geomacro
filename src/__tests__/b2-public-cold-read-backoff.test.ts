import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("governed private B2 cold fallback traffic protection",()=>{
  const source=readFileSync("src/lib/b2-live.server.ts","utf8");

  it("prefers verified cache/edge without another private Class-B request",()=>{
    expect(source).toContain("return readPublicIntelligenceEdge();");
    expect(source).toContain("return readGlobalRiskEdge();");
    const cacheIndex=source.indexOf("const cached = cache.get(key);");
    const holdIndex=source.indexOf("providerQuotaCooldownUntil > Date.now() || circuitOpen()");
    const fetchIndex=source.indexOf("const response = await fetchWithoutRedirect(`${B2_ENDPOINT}${path}`");
    expect(cacheIndex).toBeGreaterThan(0);
    expect(cacheIndex).toBeLessThan(holdIndex);
    expect(holdIndex).toBeLessThan(fetchIndex);
    const reservationIndex=source.indexOf("if (!(await reservePrivateB2Read(key))) return null;");
    expect(holdIndex).toBeLessThan(reservationIndex);
    expect(reservationIndex).toBeLessThan(fetchIndex);
    expect(source).toContain("cached.expiresAt > Date.now()");
  });

  it("enforces local UTC-day hard-cap hold and 15m generic 403/429 backoff",()=>{
    expect(source).toContain("transaction_cap_exceeded|download_cap_exceeded");
    expect(source).toContain("B2_COLD_READ_BACKOFF_MS = 15 * 60_000");
    expect(source).toContain("nextUtcDay(nowMs)");
    expect(source).toContain("status === 403 || status === 429");
    expect(source).toContain("noteProviderReadDenial(response.status, errorBody)");
    expect(source).toContain("if (providerQuotaCooldownUntil > Date.now() || circuitOpen()) return null;");
  });

  it("does not turn cooldown into permission to publish or charge",()=>{
    expect(source).toContain("recentEnough(payload.generated_at");
    expect(source).toContain("COMMERCIAL_SOURCE_RIGHTS_FALLBACK_MAX_AGE_MS");
    expect(source).toContain("seen.has(sourceId)");
    expect(source).not.toContain("commercial_eligible = true");
  });
});
