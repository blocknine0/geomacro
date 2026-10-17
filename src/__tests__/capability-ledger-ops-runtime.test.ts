import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {it,expect} from 'vitest';
it('executes real Worker catalogue/quote/storage contracts without provider funds',()=>{
 const r=spawnSync(process.execPath,['--test','--test-reporter=tap',resolve('scripts/ops/verify-capability-durable-ledger.test.mjs')],
  {encoding:'utf8',timeout:15000,env:{PATH:process.env.PATH}});
 expect(r.error).toBeUndefined();expect(r.status,r.stdout+r.stderr).toBe(0);
 expect(r.stdout).toContain('# fail 0');
});
