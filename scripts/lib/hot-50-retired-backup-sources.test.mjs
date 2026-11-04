import test from "node:test";
import assert from "node:assert/strict";
import {hot50RetiredBackupSources} from "./hot-50-retired-backup-sources.mjs";
import {threeDomainGlobal20mPublisherRegistry} from "./three-domain-global-direct-20m-sources.mjs";
test("fourteen alternate routes and production fetch pinning",()=>{
 const backup=hot50RetiredBackupSources();
 assert.equal(backup.replacements.length,14);
 assert.equal(backup.registry.length,14);
 const {registry,summary}=threeDomainGlobal20mPublisherRegistry(new Date("2026-11-04T06:00:00Z"));
 assert.equal(summary.hot50_retired_backup_mapping_count,14);
 assert.ok(registry.length<=504);
 for(const entry of backup.replacements)
  assert.ok(registry.some(source=>source.url===entry.backup_url&&source.backup_for_retired_ids?.includes(entry.retired_source_id)));
 assert.equal(new Set(registry.map(x=>x.url)).size,registry.length);
});
