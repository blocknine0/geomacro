import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

const migration = read("supabase/migrations/908_testnet_public_share_pages.sql");
const service = read("src/lib/testnet-share.server.ts");
const createRoute = read("server/api/testnet-tester/share.post.ts");
const cardRoute = read("server/api/testnet-tester/share-card/[slug].get.ts");
const pageRoute = read("server/routes/share/testnet/[slug].get.ts");

const forbidden = [
  "publisher_name",
  "publisher_url",
  "source_url",
  "oauth_access_token",
  "oauth_refresh_token",
  "private_key",
  "seed_phrase",
  "raw_evidence",
];

describe("Testnet public share flow static contract", () => {
  it("requires an owned successful shareable Testnet tester usage event", () => {
    expect(service).toContain('.eq("principal_id", principalId)');
    expect(service).toContain('usage.data.environment !== "testnet"');
    expect(service).toContain('usage.data.access_surface !== "testnet_tester"');
    expect(service).toContain("!usage.data.success || !usage.data.shareable");
  });

  it("requires a complete active nonsuspended tester profile", () => {
    expect(service).toContain('profile.data.registration_status !== "complete"');
    expect(service).toContain('profile.data.access_status !== "active"');
    expect(service).toContain("profile.data.suspended_at");
  });

  it("takes the optional public profile name from the verified profile, never request text", () => {
    expect(service).toContain("input.displayProfileName ? profile.data.profile_name : null");
    expect(createRoute).not.toContain("profile_name: String(body");
  });

  it("stores only bounded public-card fields and preserves the source-identity boundary", () => {
    expect(migration).toContain("testnet_public_share_pages");
    expect(migration).toContain("No upstream news publisher/source identity");
    expect(service).toContain("upstream_news_source_identity_exposed: false");
    for (const token of forbidden) {
      expect(service.toLowerCase()).not.toContain(token);
      expect(pageRoute.toLowerCase()).not.toContain(token);
    }
  });

  it("serves canonical OG/Twitter metadata from the persisted share slug", () => {
    expect(pageRoute).toContain('rel="canonical"');
    expect(pageRoute).toContain('property="og:image"');
    expect(pageRoute).toContain('property="og:image:width" content="1200"');
    expect(pageRoute).toContain('name="twitter:card" content="summary_large_image"');
    expect(cardRoute).toContain("loadPublicTestnetSharePage");
  });

  it("does not cache authenticated share mutations", () => {
    expect(createRoute).toContain('"Cache-Control": "no-store"');
  });
});
