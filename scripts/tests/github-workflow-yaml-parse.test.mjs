#!/usr/bin/env node
/**
 * Repository-wide GitHub Actions YAML syntax gate.
 * GitHub rejects invalid workflow YAML before it schedules any job, so
 * Product CI must parse the whole retained workflow directory, not
 * merely check workflow filenames or trigger strings.
 * Offline only: no tokens, provider calls, deployments, SQL or funds.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import * as yaml from 'js-yaml';

const directory='.github/workflows';
const parseWorkflow=filename=>{
 const source=readFileSync(join(directory,filename),'utf8');
 try{
  const result=yaml.load(source,{filename, json:false});
  assert.ok(result && typeof result==='object' && !Array.isArray(result),
   'WORKFLOW_YAML_TOP_LEVEL_MAPPING_REQUIRED');
  assert.ok(Object.hasOwn(result,'on'),'WORKFLOW_TRIGGER_REQUIRED');
  assert.ok(result.jobs && typeof result.jobs==='object' && !Array.isArray(result.jobs),
   'WORKFLOW_JOBS_REQUIRED');
  return result;
 }catch(error){
  const position=error?.mark?
   ` at line ${error.mark.line+1}, column ${error.mark.column+1}`:"";
  const excerpt=typeof error?.mark?.snippet==="string"?`\n${error.mark.snippet}`:"";
  const sourceLine=typeof error?.mark?.buffer==="string"?
   (error.mark.buffer.split(/\r?\n/u)[error.mark.line]??""):"";
  const version=String(yaml.VERSION??yaml.default?.VERSION??"unknown");
  throw Error('INVALID_GITHUB_WORKFLOW_YAML '+filename+position+
   ' parser='+version+': '+String(error?.reason??error?.message??error)+
   (sourceLine?`\n${sourceLine}`:"")+excerpt);
 }
};

test('every retained GitHub Actions workflow parses as YAML before merge',()=>{
 const files=readdirSync(directory).filter(f=>/\.ya?ml$/u.test(f)).sort();
 assert.ok(files.length>0,'WORKFLOW_DIRECTORY_EMPTY');
 for(const file of files)parseWorkflow(file);
});

test('Step3 isolated Shadow fixture checkout has an exact immutable SHA expression',()=>{
 const parsed=parseWorkflow('step3-shadow-0204-nonfact-index-fixture.yml');
 const steps=parsed.jobs?.['physical-shadow-nonfact-fixture']?.steps;
 assert.ok(Array.isArray(steps),'STEP3_PHYSICAL_SHADOW_JOB_MISSING');
 const checkout=steps.find(step=>String(step.uses??'').startsWith('actions/checkout@'));
 assert.ok(checkout,'STEP3_SHADOW_CHECKOUT_MISSING');
 assert.equal(checkout.with?.ref,'${{ github.sha }}','STEP3_SHADOW_EXACT_COMMIT_REF_REQUIRED');
 assert.equal(checkout.with?.['persist-credentials'],false,
  'STEP3_SHADOW_CHECKOUT_CREDENTIALS_MUST_NOT_PERSIST');
});
