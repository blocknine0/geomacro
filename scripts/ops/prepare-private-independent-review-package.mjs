#!/usr/bin/env node
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createB2Client} from './b2-s3-client.mjs';
import {archiveIndependentReviewPreparation} from '../lib/independent-review-preparation.mjs';
try{
 if(process.argv.length!==3||process.argv[2]!=='--private-review-preparation'||
  process.env.GITHUB_REPOSITORY!=='blocknine0/geomacro'||process.env.GITHUB_REF!=='refs/heads/main'||
  !/^\d{1,20}$/u.test(process.env.GITHUB_RUN_ID??'')||
  process.env.B2_ACCOUNT_QUOTA_REQUIRED!=='1'||
  process.env.B2_ACCOUNT_QUOTA_WORKFLOW_ID!=='private_review_preparation'||
  process.env.B2_REQUEST_BUDGET!=='8'||!process.env.D1_DATABASE_ID)
  throw Error('PROTECTED_CONTEXT_REQUIRED');
 for(const key of ['SUPABASE_DB_URL','SUPABASE_URL','APP_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY','APP_SUPABASE_SERVICE_ROLE_KEY',
  'RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64','COINBASE_API_KEY','COINBASE_COMMERCE_API_KEY'])
  if(process.env[key])throw Error('SOURCE_SIGNING_OR_PAYMENT_CREDENTIAL_FORBIDDEN');
 const pins=JSON.parse(readFileSync('config/private-review-preparation-source.v1.json','utf8'));
 const archiveClient=createB2Client({endpointUrl:'https://s3.us-east-005.backblazeb2.com',
  bucket:'geomacro-private-archive',accessKey:process.env.B2_KEY_ID,secretKey:process.env.B2_APPLICATION_KEY});
 const receipt=await archiveIndependentReviewPreparation({pins,archiveClient});
 const dir='artifacts/private-review-preparation';mkdirSync(dir,{recursive:true,mode:0o700});
 // ONLY this source-free receipt may leave the protected runner. The real
 // original-source review packet remains private in B2, never Actions artifacts.
 writeFileSync(dir+'/receipt.json',JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify(receipt));
}catch{console.error('PRIVATE_INDEPENDENT_REVIEW_PACKAGE_PREPARATION_FAILED_CLOSED');process.exitCode=2;}
