import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,renameSync,existsSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('history-only migration quarantine and original are always on same filesystem',()=>{
 const root=mkdtempSync(join(tmpdir(),'geomacro-quarantine-test-'));
 try{
  const migrationDir=join(root,'supabase','migrations');
  mkdirSync(migrationDir,{recursive:true});
  const src=join(migrationDir,'signed-historical-example.sql');
  writeFileSync(src,'-- synthetic test only, no database or Supabase connection');
  const quarantine=mkdtempSync(join(root,'.geomacro-history-only-'));
  const parked=join(quarantine,'signed-historical-example.sql');
  renameSync(src,parked);
  assert.equal(existsSync(src),false);
  assert.equal(existsSync(parked),true);
  renameSync(parked,src);
  assert.equal(existsSync(src),true);
  assert.equal(existsSync(parked),false);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('production checker keeps independent historical verification and full safety check',()=>{
 const source=readFileSync(new URL('./check-migration-safety-history-aware.mjs',import.meta.url),'utf8');
 assert.ok(source.includes("mkdtempSync(path.join(root, '.geomacro-history-only-'))"));
 assert.equal(source.includes('os.tmpdir()'),false);
 assert.ok(source.includes('verifyProductionHistoryOnlyMigrations(root)'));
 assert.ok(source.includes("['scripts/db/check-migration-safety.mjs']"));
 assert.ok(source.includes('finally {'));
 assert.ok(source.includes('fs.renameSync(quarantined, path.join(migrationsDir, file))'));
});