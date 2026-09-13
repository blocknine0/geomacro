import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(__dirname, "../..", path), "utf8");

describe("Testnet profile image saved-state UX", () => {
  it("restores saved avatar state from the tester account", () => {
    const src = read("public/testnet-access.js");
    expect(src).toContain("if (account.avatar_path)");
    expect(src).toContain('text("avatarStatus", "Profile image saved ✓")');
    expect(src).toContain("setAvatarEditorState(false, true)");
  });

  it("offers an explicit change action instead of leaving an empty chooser visible", () => {
    const src = read("public/testnet-access.js");
    expect(src).toContain('button.textContent = "Change profile image"');
    expect(src).toContain("inputField.hidden = avatarPresent && !editing");
    expect(src).toContain("submitField.hidden = avatarPresent && !editing");
    expect(src).toContain('submitButton.textContent = avatarPresent ? "Save new profile image" : "Upload profile image"');
  });

  it("returns to saved state after a successful replacement upload", () => {
    const src = read("public/testnet-access.js");
    expect(src).toContain('await json("/api/testnet-tester/avatar", { method: "POST", body: data })');
    expect(src).toContain("await loadAccount()");
    expect(src).toContain('text("avatarStatus", "Profile image saved ✓")');
  });
});
