import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

const helper = readFileSync("scripts/prepare-telegram-isolated-migration-workdir.mjs", "utf8")

describe("Telegram isolated migration history", () => {
  it("rebases isolated migrations away from the shared remote history versions", () => {
    for (const version of ["980", "981", "982", "983", "984"]) {
      expect(helper).toContain(`\"${version}_`)
    }
    expect(helper).toContain("[0, 54]")
    expect(helper).toContain("[900, 951]")
    expect(helper).toContain("production migrations 952+ are never copied")
  })

  it("does not repair or rewrite remote migration history", () => {
    expect(helper).not.toContain("migration repair")
    expect(helper).not.toContain("reverted")
    expect(helper).not.toContain("supabase/migrations")
  })
})
