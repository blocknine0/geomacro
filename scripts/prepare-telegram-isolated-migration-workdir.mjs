import fs from "node:fs"
import path from "node:path"

const ROOT = process.cwd()
const SOURCE_DIR = path.join(ROOT, "supabase", "isolated-signal")
const SOURCE_MIGRATIONS = path.join(SOURCE_DIR, "migrations")
const TARGET_DIR = path.join(ROOT, ".tmp", "telegram-isolated-supabase")
const TARGET_MIGRATIONS = path.join(TARGET_DIR, "migrations")

const REMOTE_HISTORY_RANGES = [
  [0, 54],
  [900, 951],
]

const ISOLATED_REBASE = [
  ["950_telegram_signal_ingest_isolation.sql", "980_telegram_signal_ingest_isolation.sql"],
  ["951_telegram_signal_compact_storage.sql", "981_telegram_signal_compact_storage.sql"],
  ["952_realtime_flash_event_lifecycle.sql", "982_realtime_flash_event_lifecycle.sql"],
  ["953_event_family_version_ledger.sql", "983_event_family_version_ledger.sql"],
  ["954_telegram_authorized_publisher_only.sql", "984_telegram_authorized_publisher_only.sql"],
]

function migrationVersionName(version) {
  return String(version).padStart(3, "0")
}

fs.rmSync(TARGET_DIR, { recursive: true, force: true })
fs.mkdirSync(TARGET_MIGRATIONS, { recursive: true })
fs.copyFileSync(path.join(SOURCE_DIR, "config.toml"), path.join(TARGET_DIR, "config.toml"))

for (const [start, end] of REMOTE_HISTORY_RANGES) {
  for (let version = start; version <= end; version += 1) {
    const prefix = migrationVersionName(version)
    const filename = `${prefix}_remote_history_placeholder.sql`
    fs.writeFileSync(
      path.join(TARGET_MIGRATIONS, filename),
      `-- Remote migration ${prefix} predates the isolated Telegram migration lineage.\n-- Placeholder exists only so Supabase CLI can reconcile already-applied history.\n`,
    )
  }
}

for (const [sourceName, targetName] of ISOLATED_REBASE) {
  const sourcePath = path.join(SOURCE_MIGRATIONS, sourceName)
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing isolated migration: ${sourceName}`)
  }
  fs.copyFileSync(sourcePath, path.join(TARGET_MIGRATIONS, targetName))
}

const generated = fs.readdirSync(TARGET_MIGRATIONS).sort()
const rebasedTargets = ISOLATED_REBASE.map(([, target]) => target)
for (const target of rebasedTargets) {
  if (!generated.includes(target)) throw new Error(`Rebased migration missing: ${target}`)
}

if (generated.some((name) => /^95[0-4]_telegram_/.test(name) || /^95[2-4]_/.test(name))) {
  throw new Error("Original isolated migration versions leaked into prepared workdir")
}

console.log(JSON.stringify({
  target_dir: path.relative(ROOT, TARGET_DIR),
  historical_placeholder_count: generated.length - rebasedTargets.length,
  isolated_migrations: rebasedTargets,
  invariant: "production migrations 952+ are never copied into the isolated Telegram workdir",
}, null, 2))
