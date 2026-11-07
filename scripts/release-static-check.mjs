#!/usr/bin/env node
/** Parse TypeScript without executing remote/provider scripts or credentials. */
import {stripTypeScriptTypes} from 'node:module';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const sources=[
 'scripts/release-common.ts','scripts/release-remediate.ts',
 'scripts/apply-d1-migrations.ts','scripts/canary-promoter.ts',
 'scripts/verify-d1-quota-proof.ts','scripts/certify-b2-parity.ts',
 'src/middleware/quotaCircuitBreaker.ts','src/middleware/quotaWorker.ts',
 'src/risk/hot50Attestation.ts',
];
for(const path of sources){
 const code=stripTypeScriptTypes(readFileSync(path,'utf8'),{mode:'strip'});
 const run=spawnSync(process.execPath,['--input-type=module','--check'],{input:code,encoding:'utf8'});
 if(run.status!==0)throw Error(`RELEASE_SOURCE_SYNTAX_INVALID ${path}: ${run.stderr.slice(0,800)}`);
}
const pkg=JSON.parse(readFileSync('package.json','utf8'));
if(pkg.scripts?.['release:remediate']!=='node --experimental-strip-types scripts/release-remediate.ts')
 throw Error('RELEASE_NPM_SCRIPT_NOT_INSTALLED');
console.log(`RELEASE_STATIC_SOURCE_PASS ${sources.length}`);
