import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(path,'utf8');
test('source-only admission reaches one maximum-packed publisher and static archive without authorizing signing',()=>{
 const workflow=read('.github/workflows/five-minute-original-news-fastlane.yml');
 const producer=workflow.slice(workflow.indexOf('  original-five-minute-derived-news:'));
 const source=producer.slice(producer.indexOf('      - name: Report held source slot'),producer.indexOf('      - name: Publish current verified source-neutral'));
 assert.match(source,/steps\.budget\.outputs\.source_intake/);
 assert.match(source,/GEOMACRO_LOW_SOURCE_REVIEW: \$\{\{ steps\.budget\.outputs\.critical == 'true'/);
 assert.match(source,/publish-permanent-derived-news-archive\.mjs/);
 const followup=producer.slice(producer.indexOf('      - name: Automatically approve and sign'));
 assert.match(followup,/steps\.budget\.outputs\.critical == 'true'/);
 assert.match(workflow,/quota_admitted: \$\{\{ steps\.budget\.outputs\.critical == 'true' && steps\.intake-clock\.outputs\.due == 'true'/);
 const script=read('scripts/ops/publish-original-news-five-minute-fastlane.ts');
 assert.match(script,/archiveSignals=verifiedArchiveSignals/);
 assert.match(script,/publishPending.length<intakeMaxRows/);
 assert.match(script,/signals:\[\]/);
 assert.match(script,/permanent-derived-news-candidates\.v1/);
 assert.match(script,/packDerivedNewsBatches\(publishPending\)/);
 assert.match(script,/verifyDerivedStory\(s,runAt\)/);
});
test('all static archive writers use the same lock; no new schedule or parallel archive writer race',()=>{
 for(const path of ['.github/workflows/five-minute-original-news-fastlane.yml','.github/workflows/website-derived-news-continuity.yml','.github/workflows/deploy-permanent-public-finds-archive.yml']){
  const value=read(path);assert.match(value,/group: geomacro-permanent-news-publication/);assert.match(value,/cancel-in-progress: false/);
 }
});
