import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

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
  const urlMap = new Map();

  for (const file of files) {
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
    a.endpoint_url.localeCompare(b.endpoint_url),
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const manifest = await collectMigrationEndpointManifest();
  const lock = await readEndpointManifestLock();
  assertEndpointManifestLock(manifest, lock);
  console.log(JSON.stringify({
    pass: true,
    endpoint_count: manifest.endpoint_count,
    manifest_sha256: manifest.manifest_sha256,
  }, null, 2));
}
