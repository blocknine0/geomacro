import { describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8")

describe("Telegram controlled main alignment contract", () => {
  it("keeps the alignment ledger immutable and verification-gated", () => {
    const migration = read("supabase/migrations/952_telegram_signal_main_alignment.sql")

    expect(migration).toContain("telegram_signal_alignment")
    expect(migration).toContain("verification_status = 'VERIFIED'")
    expect(migration).toContain("verification_score_bps between 6500 and 10000")
    expect(migration).toContain("independent_source_count >= 2")
    expect(migration).toContain("before update or delete")
    expect(migration).toContain("telegram signal alignment records are immutable")
    expect(migration).toContain("Raw Telegram content is prohibited")
  })

  it("exports only verified compact signal records", () => {
    const fn = read("supabase/functions/live-flash-alignment-export/index.ts")

    expect(fn).toContain('.eq("verification_status", "VERIFIED")')
    expect(fn).toContain('.gte("verification_score_bps", 6500)')
    expect(fn).toContain('.gte("independent_source_count", 2)')
    expect(fn).toContain("raw_content_included: false")
    expect(fn).not.toContain("body,")
    expect(fn).not.toContain("raw_payload")
  })

  it("aligns only against authoritative structured events and stores no raw headline", () => {
    const fn = read("supabase/functions/live-flash-align/index.ts")

    expect(fn).toContain("no_authoritative_structured_event_match")
    expect(fn).toContain("raw_content_stored: false")
    expect(fn).toContain("telegram-main-alignment-envelope-v1.0.0")
    expect(fn).toContain("sha256Hex")
    expect(fn).not.toContain("headline:")
    expect(fn).not.toContain("body:")
  })

  it("supervises the alignment loop and ships it in the image", () => {
    const supervisor = read("workers/telegram-flash/supervisor.py")
    const dockerfile = read("workers/telegram-flash/Dockerfile")
    const loop = read("workers/telegram-flash/alignment_loop.py")

    expect(supervisor).toContain('"alignment", sys.executable, "alignment_loop.py"')
    expect(dockerfile).toContain("COPY alignment_loop.py ./")
    expect(loop).toContain("raw_content_included")
    expect(loop).toContain("raw_content_stored")
  })
})
