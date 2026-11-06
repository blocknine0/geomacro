import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {recoverPinnedGriVersion,selectPinnedHistoricalVersion} from '../../scripts/ops/recover-gri-pinned-b2-version.mjs';

const key='geomacro-evidence/v1/live/global-risk/latest.json.gz';
const anchor={b2_sha256:'a'.repeat(64)};

describe('D1-indexed historical B2 recovery boundary',()=>{
 it('selects only the exact D1-indexed immutable version and hash',()=>{
  const row={path:key,b2_file_id:'4_z_immutable_original_version',sha256:anchor.b2_sha256};
  expect(selectPinnedHistoricalVersion(row,anchor,key)).toEqual(row);
  expect(()=>selectPinnedHistoricalVersion({...row,sha256:'b'.repeat(64)},anchor,key))
    .toThrow('GRI_VERSION_D1_FILE_INDEX_REQUIRED');
 });
 it('never attempts a provider request while the exact version is not indexed in D1',async()=>{
  const fetchImpl=vi.fn();
  await expect(recoverPinnedGriVersion({fetchImpl})).rejects.toThrow('GRI_VERSION_D1_FILE_INDEX_REQUIRED');
  expect(fetchImpl).not.toHaveBeenCalled();
 });
 it('retires the old list-based workflow path and keeps the no-funds boundary',()=>{
  const w=readFileSync('.github/workflows/gri-pinned-version-recovery.yml','utf8');
  const script=readFileSync('scripts/ops/recover-gri-pinned-b2-version.mjs','utf8');
  expect(w).toContain('github.ref == \'refs/heads/main\'');
  expect(w).toContain('GRI_HISTORY_NO_FUNDS_AND_NO_SUPABASE_REQUIRED');
  expect(script).not.toMatch(/b2_list_|ListObjectsV2|list-type=2/u);
 });
});
