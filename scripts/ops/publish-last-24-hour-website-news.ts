#!/usr/bin/env bun
import {mkdirSync,writeFileSync} from 'node:fs';
import {backfillLast24HourNews} from '../../src/lib/last-24-hour-news-backfill.server';
import {readStatelessWebsiteIntelligence} from '../../src/lib/stateless-public-intelligence.server';
import {createRunScopedAustralianResourcesFetch} from '../../src/lib/stateless-run-shared-official-fetch';
import {fetchAllDerivedNews} from '../../src/lib/public-derived-news-client';
import {createContinentNewsPublisher} from '../lib/continent-news-publication.mjs';
if(process.env.GITHUB_REPOSITORY!=='blocknine0/geomacro'||process.env.GITHUB_REF!=='refs/heads/main'||
 !['schedule','workflow_dispatch','push'].includes(process.env.GITHUB_EVENT_NAME??''))
 throw Error('LAST_24H_NEWS_PROTECTED_MAIN_ONLY');
try{
 const now=Date.now(),shared=createRunScopedAustralianResourcesFetch();
 const publisher=await createContinentNewsPublisher({root:process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN,
  readJournal:fetchAllDerivedNews,now:()=>now});
 const receipt=await backfillLast24HourNews({now,publisher,
  readCategory:category=>readStatelessWebsiteIntelligence(category,now,undefined,undefined,200,shared)});
 mkdirSync('artifacts/country-195',{recursive:true,mode:0o700});
 writeFileSync('artifacts/country-195/last-24-hour-news-backfill.v1.json',JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify(receipt));
 if(!receipt.complete)process.exitCode=1;
}catch{
 console.error('::error::LAST_24H_WEBSITE_NEWS_BACKFILL_UNVERIFIED');process.exitCode=1;
}
