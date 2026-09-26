import fs from "node:fs"
import path from "node:path"

const ROOT = process.cwd()
const SOURCE_DIR = path.join(ROOT, "supabase", "isolated-signal")
const SOURCE_MIGRATIONS = path.join(SOURCE_DIR, "migrations")
const configuredTarget = String(process.env.ISOLATED_WORKDIR ?? "").trim()
const TARGET_DIR = configuredTarget
  ? path.resolve(ROOT, configuredTarget)
  : path.join(ROOT, ".tmp", "telegram-isolated-supabase")
const TARGET_SUPABASE = path.join(TARGET_DIR, "supabase")
const TARGET_MIGRATIONS = path.join(TARGET_SUPABASE, "migrations")

const REMOTE_HISTORY_RANGES = [
  [0, 54],
  [900, 951],
]

const ISOLATED_MIGRATIONS = [
  "980_telegram_signal_ingest_isolation.sql",
  "981_telegram_signal_compact_storage.sql",
  "982_realtime_flash_event_lifecycle.sql",
  "983_event_family_version_ledger.sql",
  "984_telegram_authorized_publisher_only.sql",
  "985_breaking_feed_registry_parity.sql",
]

function migrationVersionName(version) {
  return String(version).padStart(3, "0")
}

fs.rmSync(TARGET_DIR, { recursive: true, force: true })
fs.mkdirSync(TARGET_MIGRATIONS, { recursive: true })
fs.copyFileSync(path.join(SOURCE_DIR, "config.toml"), path.join(TARGET_SUPABASE, "config.toml"))

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

for (const filename of ISOLATED_MIGRATIONS) {
  const sourcePath = path.join(SOURCE_MIGRATIONS, filename)
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing isolated migration: ${filename}`)
  }
  fs.copyFileSync(sourcePath, path.join(TARGET_MIGRATIONS, filename))
}

const generated = fs.readdirSync(TARGET_MIGRATIONS).sort()
for (const filename of ISOLATED_MIGRATIONS) {
  if (!generated.includes(filename)) throw new Error(`Isolated migration missing: ${filename}`)
}

if (generated.some((name) => /^95[2-9]_/.test(name))) {
  throw new Error("Authoritative production migration >=952 leaked into prepared isolated workdir")
}

// Supabase --workdir expects a standard project root containing supabase/config.toml
// and supabase/migrations. Keep root-level compatibility links only for existing
// CI assertions; the CLI consumes the nested canonical layout above.
fs.symlinkSync(path.join("supabase", "migrations"), path.join(TARGET_DIR, "migrations"), "dir")
fs.copyFileSync(path.join(TARGET_SUPABASE, "config.toml"), path.join(TARGET_DIR, "config.toml"))

console.log(JSON.stringify({
  target_dir: TARGET_DIR,
  supabase_dir: TARGET_SUPABASE,
  historical_placeholder_count: generated.length - ISOLATED_MIGRATIONS.length,
  isolated_migrations: ISOLATED_MIGRATIONS,
  invariant: "production migrations 952+ are never copied into the isolated Telegram workdir",
}, null, 2))
