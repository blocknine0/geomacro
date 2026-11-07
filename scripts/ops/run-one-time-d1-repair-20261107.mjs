#!/usr/bin/env node
import {runProtectedD1Repair} from './run-protected-d1-repair.mjs';
import {verifyProtectedD1CanaryPreflight} from './verify-protected-d1-zero-canary-preflight.mjs';
import {assessOneTimeD1Repair} from './one-time-d1-repair-20261107.mjs';
try{
 const result=await runProtectedD1Repair({plan:verifyProtectedD1CanaryPreflight,
  assessBudget:assessOneTimeD1Repair});
 console.log(JSON.stringify(result));
}catch(e){
 console.error(JSON.stringify({status:'HOLD',code:/^(?:REPAIR|MIGRATION)_[A-Z0-9_]+$/.test(e?.message??'')?
  e.message:'REPAIR_EXECUTION_UNAVAILABLE',ordinary_daily_targets_unchanged:true,payments:0}));
 process.exitCode=2;
}
