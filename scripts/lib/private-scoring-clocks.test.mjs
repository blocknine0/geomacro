import test from 'node:test';
import assert from 'node:assert/strict';
import {makePrivateStageRecord,makePrivateStageBundle,validatePrivateStageBundle} from './restricted-private-scored-stage.mjs';
import {capturePrivateGriSourceCompanion,makePrivateGriCompanionBundle} from './private-gri-original-publisher-companion.mjs';
const now=new Date('2026-10-21T12:00:00.000Z');
const article={url:'https://publisher.example.org/release',sourceDomain:'publisher.example.org',
  title:'Original issuer announces material monetary policy change',
  publishedAt:'2026-10-21T10:30:00.000Z',firstObservedAt:'2026-10-21T11:15:00.000Z'};
const assessment={relevant:true,category:'macro',severity:50,confidence:80,
  narrative:'Monetary policy change increases funding exposure.',
  summary:'The issuer decision changes the monetary policy outlook.',
  classificationVersion:'event-severity-v1.0.5',classificationPromptVersion:'risk-desk-filter-v1.0.5',
  classificationProvider:'gemini',classificationModel:'fixture-model',classificationInputHash:'a'.repeat(64)};
const make=(a=article)=>makePrivateStageRecord({article:a,assessment,category:'macro',now});
test('publication, first observation and scoring remain distinct and bind to companion',()=>{
  const row=make();
  assert.equal(row.published_at,article.publishedAt);
  assert.equal(row.first_observed_at,article.firstObservedAt);
  assert.equal(row.classification_scored_at,now.toISOString());
  const stage=makePrivateStageBundle([row],{now});
  const companion=capturePrivateGriSourceCompanion({article,staged:row,capturedAt:now});
  assert.equal(companion.first_observed_at,article.firstObservedAt);
  assert.equal(companion.original_published_at,article.publishedAt);
  assert.equal(makePrivateGriCompanionBundle(stage,[companion],{now}).rows.length,1);
  const refreshed=makePrivateStageBundle([row],{now:new Date(now.getTime()+10*60000)});
  assert.deepEqual(refreshed.rows,stage.rows);
});
test('unknown observation is attested only at scoring; original expiry cannot be refreshed',()=>{
  const {firstObservedAt,...original}=article;
  assert.equal(make(original).first_observed_at,now.toISOString());
  assert.throws(()=>make({...article,publishedAt:'2026-10-19T12:00:00.000Z'}),/TIME_INVALID/);
});
test('partial, reordered, noncanonical and rebound clocks fail validation',()=>{
  for (const patch of [{published_at:now.toISOString()},
    {first_observed_at:'2026-10-21T10:00:00.000Z'},
    {classification_scored_at:'2026-10-21T11:00:00.000Z'},
    {classification_scored_at:'2026-10-21T12:01:00.000Z'},
    {first_observed_at:undefined}, {first_observed_at:'2026-10-21T11:15:00Z'}])
    assert.throws(()=>makePrivateStageBundle([{...make(),...patch}],{now}), /CLOCK_ORDER_INVALID/);
  for (const firstObservedAt of ['2026-10-21T10:00:00.000Z','2026-10-21T12:01:00.000Z'])
    assert.throws(()=>make({...article,firstObservedAt}),/CLOCK_ORDER_INVALID/);
});
test('existing immutable v1 archives remain readable without inventing missing clocks',()=>{
  const row=make();
  delete row.published_at;delete row.first_observed_at;delete row.classification_scored_at;
  const stage=makePrivateStageBundle([row],{now});
  assert.deepEqual(validatePrivateStageBundle(stage,{now}).rows,[row]);
  assert.equal(Object.hasOwn(stage.rows[0],'classification_scored_at'),false);
});
