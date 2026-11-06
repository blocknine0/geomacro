#!/usr/bin/env node
import {readFileSync} from 'node:fs';
const [mode,path,arg]=process.argv.slice(2);
if(!path||!['current','uploaded','schema'].includes(mode))throw Error('PARSER_ARGS_INVALID');
const raw=JSON.parse(readFileSync(path,'utf8'));
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const arr=Array.isArray(raw)?raw:raw?.deployments??raw?.versions??raw?.result;
if(mode==='schema'){
 const results=(Array.isArray(raw)?raw:[raw]).flatMap(x=>x?.results??x?.result?.results??[]);
 const names=results.map(x=>x.name);
 const required=['materialized_cache','idx_private_osint_country_category_clock_v2',
  'idx_private_osint_check_category_status_v2','idx_website_derived_hot_order_v2',
  'geomacro_d1_soft_write_budget'];
 if(required.some(x=>!names.includes(x)))throw Error('CANARY_0204_0205_SCHEMA_READBACK_FAILED');
 console.log('SCHEMA_0204_AND_0205_VERIFIED');
}else if(!Array.isArray(arr)||!arr.length){throw Error('CANARY_WRANGLER_JSON_SHAPE_UNKNOWN')}
else if(mode==='current'){
 const item=arr[0];
 const candidates=item.versions??item.traffic??[];
 const versions=candidates.map(v=>({id:v.version_id??v.versionId??v.version?.id??v.id,
  pct:Number(v.percentage??v.traffic_percentage??v.trafficPercentage)}));
 const active=versions.filter(v=>uuid.test(v.id)&&v.pct===100);
 if(active.length!==1||versions.length!==1)throw Error('CANARY_CURRENT_100_PERCENT_NOT_PROVEN');
 console.log(active[0].id);
}else {
 const candidates=arr.filter(x=>String(x.tag??x.metadata?.tag??x.version?.tag??'')===arg);
 if(candidates.length!==1)throw Error('CANARY_UPLOADED_TAG_NOT_UNIQUE');
 const id=candidates[0].id??candidates[0].version_id??candidates[0].versionId;
 if(!uuid.test(id))throw Error('CANARY_UPLOADED_ID_UNVERIFIED');
 console.log(id);
}
