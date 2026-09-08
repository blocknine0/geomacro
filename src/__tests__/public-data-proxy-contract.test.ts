import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("public data proxy contract", () => {
  it("keeps browser public reads behind a same-origin read-only proxy", () => {
    const proxy = read("src/routes/api.public-data-proxy.ts");
    const client = read("src/lib/supabase-feed.ts");

    expect(proxy).toContain('request.method !== "GET" && request.method !== "HEAD"');
    expect(proxy).toContain('"events"');
    expect(proxy).toContain('"gri_snapshots"');
    expect(proxy).toContain('"market_disputes"');
    expect(proxy).toContain('"jury_votes"');
    expect(proxy).toContain("APP_SUPABASE_ANON_KEY");
    expect(proxy).not.toContain("APP_SUPABASE_SERVICE_ROLE_KEY");
    expect(client).toContain("/api/public-data-proxy?target=");
    expect(client).not.toMatch(/eyJhbGciOi/);
  });

  it("does not depend on direct browser realtime credentials", () => {
    const client = read("src/lib/supabase-feed.ts");
    const dispute = read("src/lib/useDisputeStatus.ts");

    expect(client).toContain('if (prop === "channel")');
    expect(client).toContain('if (prop === "removeChannel")');
    expect(dispute).toContain("setInterval(() => void loadAll(), 3000)");
    expect(dispute).not.toContain("realtimeChannelName");
  });

  it("mounts bridge and swap browser integrations after hydration", () => {
    const liquidity = read("src/components/sections/liquidity-section.tsx");

    expect(liquidity).toContain("const [mounted, setMounted] = useState(false)");
    expect(liquidity).toContain("setMounted(true)");
    expect(liquidity).toContain("<BridgeSection />");
    expect(liquidity).toContain("<SwapSection />");
  });
});
