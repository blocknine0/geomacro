#!/usr/bin/env node
import {readCloudflareD1AccountQuota} from './audit-d1-account-daily-quota-readonly.mjs';
import {readCloudflareWorkersPaidProof} from '../lib/cloudflare-workers-paid-plan-proof.mjs';
import {readFiveUsdSpendGuard} from '../lib/cloudflare-five-usd-spend-guard.mjs';
import {assessPaidEnvelope} from './d1-paid-envelope.mjs';
const now=new Date();
const [quota,paidProof,spendGuardProof]=await Promise.all([
 readCloudflareD1AccountQuota({now}),readCloudflareWorkersPaidProof({now}),
 readFiveUsdSpendGuard({now})]);
const e=assessPaidEnvelope(quota,{now,paidProof,spendGuardProof});
console.log(JSON.stringify({day_utc:e.day_utc,observed_rows_written:e.observed_rows_written,
 observed_rows_read:e.observed_rows_read,internal_soft_rows_read:e.internal_soft_rows_read,
 internal_soft_rows_written:e.internal_soft_rows_written,
 soft_read_headroom:e.soft_read_headroom,soft_write_headroom:e.soft_write_headroom,
 critical_eligible:e.critical_eligible,source_intake_eligible:e.source_intake_eligible,
 state:e.state,reason:e.reason}));
if(e.internal_soft_rows_read!==120000||!e.critical_eligible||
   e.soft_read_headroom<15300||e.soft_write_headroom<15000)
 throw Error('CANARY_D1_INTERNAL_SOFT_BUDGET_HELD');
