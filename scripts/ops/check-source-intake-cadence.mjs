#!/usr/bin/env node
// Read-only due decision before the ACTUAL publication step. A not-due slot
// must remain skipped in Actions, never appear as a verified source poll.
import {createHmac} from 'node:crypto';
import {appendFileSync} from 'node:fs';
import {intakeIsDue} from '../lib/budgeted-news-intake.mjs';
const root=String(process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN??'').trim();
if(root.length<32)throw Error('SOURCE_INTAKE_AUTH_REQUIRED');
const token=createHmac('sha256',root).update('geomacro-control-plane-v1').digest('hex');
const origin='https://geomacro-control-plane.daspallab202391.workers.dev';
const read=async path=>{
 const r=await fetch(origin+path,{headers:{Authorization:'Bearer '+token},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('SOURCE_INTAKE_CLOCK_WORKER_NOT_READY');
 return r.json();
};
const [clock,state]=await Promise.all([read('/v1/internal/news-intake-policy'),read('/v1/internal/macro-fastlane')]);
if(clock.ok!==true||clock.schema!=='geomacro.news-intake-admission.v1'||state.ok!==true)throw Error('SOURCE_INTAKE_CLOCK_INVALID');
const interval=Number(process.env.GEOMACRO_SOURCE_INTAKE_INTERVAL_MINUTES);
const due=intakeIsDue(clock.policy,interval,Date.now(),state.state?.events??[]);
if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,'due='+due+'\n');
console.log(JSON.stringify({schema:'geomacro.news-intake-due.v1',due,interval_minutes:interval,reason:due?'SOURCE_POLL_DUE':'ADAPTIVE_CADENCE_NOT_DUE',source_requests:0,news_writes:0,success_clock_refreshed:false}));
