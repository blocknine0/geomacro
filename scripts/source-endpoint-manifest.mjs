import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

export async function collectMigrationEndpointManifest(root = process.cwd()) {
  const migrationsDir = path.join(root, "supabase", "migrations");

  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) files.push(...await walk(full));
      else if (entry.isFile() && entry.name.endsWith(".sql")) files.push(full);
    }
    return files;
  }

  const files = (await walk(migrationsDir)).sort();
  const excludedMigrationNames = new Set([
    "964_stage1_realtime_source_mesh.sql",
    "965_stage1_provider_expansion_catalog.sql",
    "966_commercial_provider_source_type.sql",
    "967_global_raw_source_coverage_mesh.sql",
    "968_country_raw_web_snapshot_store.sql",
    "969_telegram_global_discovery_metadata.sql",
    "970_realtime_scope_fanout_mesh.sql",
    "973_completed_source_access_registry.sql",
  ]);
  // Phase-B endpoint census remains frozen at 933; Stage-1 realtime fanout
  // has its own source/target governance and is audited separately.
  const sourceFiles = files.filter((file) => !excludedMigrationNames.has(path.basename(file)));
  const urlMap = new Map();

  for (const file of sourceFiles) {
    const source = await fs.readFile(file, "utf8");
    for (const match of source.matchAll(/https?:\/\/[^\s'"\`\)>;]+/g)) {
      const raw = match[0].replace(/[),.;]+$/, "");
      try {
        const url = new URL(raw).toString();
        if (!urlMap.has(url)) {
          const line = source.slice(0, match.index).split("\n").length;
          urlMap.set(url, {
            endpoint_url: url,
            first_seen_file: path.relative(root, file),
            first_seen_line: line,
          });
        }
      } catch {}
    }
  }

  const entries = [...urlMap.values()].sort((a, b) =>
    a.endpoint_url < b.endpoint_url ? -1 : a.endpoint_url > b.endpoint_url ? 1 : 0,
  );
  const canonicalText = entries.map((entry) => entry.endpoint_url).join("\n");
  const manifestSha256 = createHash("sha256")
    .update(canonicalText, "utf8")
    .digest("hex");

  return {
    schema_version: "geomacro-source-endpoint-manifest-v1",
    source: "supabase/migrations",
    endpoint_count: entries.length,
    manifest_sha256: manifestSha256,
    entries,
  };
}

export async function readEndpointManifestLock(root = process.cwd()) {
  const lockPath = path.join(root, "config", "source-endpoint-manifest-lock.json");
  return JSON.parse(await fs.readFile(lockPath, "utf8"));
}

export function assertEndpointManifestLock(manifest, lock) {
  if (manifest.endpoint_count !== lock.endpoint_count) {
    throw new Error(
      `Endpoint manifest count drift: lock=${lock.endpoint_count}, current=${manifest.endpoint_count}`,
    );
  }
  if (manifest.manifest_sha256 !== lock.manifest_sha256) {
    throw new Error(
      `Endpoint manifest hash drift: lock=${lock.manifest_sha256}, current=${manifest.manifest_sha256}`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifest = await collectMigrationEndpointManifest();
  const lock = await readEndpointManifestLock();
  assertEndpointManifestLock(manifest, lock);
  console.log(JSON.stringify({
    pass: true,
    endpoint_count: manifest.endpoint_count,
    manifest_sha256: manifest.manifest_sha256,
  }, null, 2));
}
