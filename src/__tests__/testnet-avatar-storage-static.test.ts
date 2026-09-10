import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("Testnet tester avatar storage", () => {
  it("uses a private constrained Supabase Storage bucket", () => {
    const migration = read("supabase/migrations/907_testnet_tester_avatar_storage.sql");
    expect(migration).toContain("testnet-tester-avatars");
    expect(migration).toContain("false");
    expect(migration).toContain("2097152");
    expect(migration).toContain("image/png");
    expect(migration).toContain("image/jpeg");
    expect(migration).toContain("image/webp");
  });

  it("sniffs file signatures server-side and stores generated paths only", () => {
    const service = read("src/lib/testnet-tester-avatar.server.ts");
    expect(service).toContain("detectAvatarType");
    expect(service).toContain("MAX_AVATAR_BYTES");
    expect(service).toContain('randomBytes(18).toString("hex")');
    expect(service).toContain("upsert: false");
    expect(service).not.toMatch(/fetch\s*\(/);
    expect(service).not.toMatch(/https?:\/\//);
  });

  it("requires tester auth for avatar reads and writes", () => {
    for (const path of [
      "server/api/testnet-tester/avatar.get.ts",
      "server/api/testnet-tester/avatar.post.ts",
    ]) {
      expect(read(path), path).toContain("requireTesterPrincipal(event)");
    }
  });

  it("keeps avatar UI bounded to accepted image types and 2 MB", () => {
    const page = read("server/routes/testnet-access.get.ts");
    const browser = read("public/testnet-access.js");
    expect(page).toContain('accept="image/png,image/jpeg,image/webp"');
    expect(page).toContain("max 2 MB");
    expect(browser).toContain("2 * 1024 * 1024");
    expect(browser).toContain('data.append("avatar", file)');
  });
});
