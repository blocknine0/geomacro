#!/usr/bin/env node
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const db=process.env.D1_DATABASE_ID,sha=process.env.GITHUB_SHA;
if(!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(db??'')||
   !/^[a-f0-9]{40}$/.test(sha??''))throw Error('CANARY_ID_OR_SHA_UNVERIFIED');
const base=JSON.parse(readFileSync('workers/control-plane/wrangler.example.jsonc','utf8'));
if(base.name!=='geomacro-control-plane'||base.main!=='src/index.mjs'||
 base.d1_databases?.length!==1||base.d1_databases[0].binding!=='DB'||
 base.d1_databases[0].migrations_dir!=='migrations'||
 base.vars?.RISK_GATE_COUNTRY_SCOPE!=='HOT50'||
 base.vars?.GEOMACRO_CUSTOMER_PAID_RUNTIME_ACCEPTANCE===
   'ACCEPTED_CANONICAL_D1_PAID_RUNTIME')throw Error('CANARY_PRODUCTION_TEMPLATE_DRIFT');
base.d1_databases[0].database_id=db;
base.vars={...base.vars,GEOMACRO_SOURCE_SHA:sha,
 GEOMACRO_D1_READ_HOTSPOT_V2:'1',GEOMACRO_D1_READ_METRICS_SAMPLE:'1'};
if(base.vars.GEOMACRO_CUSTOMER_PAID_RUNTIME_ACCEPTANCE)
 throw Error('CANARY_PAYMENT_RUNTIME_MUST_REMAIN_UNACCEPTED');
const source=JSON.stringify(base,null,2)+'\n';
const digest=createHash('sha256').update(source).digest('hex');
if (process.argv[2]==='--preview') {
 console.log(source);
 console.log('GEOMACRO_REVIEWED_CANARY_CONFIG_SHA256='+digest);
 process.exit(0);
}
if(process.argv.length>2)throw Error('CANARY_CONFIG_UNEXPECTED_ARGUMENTS');
if(!/^[a-f0-9]{64}$/.test(process.env.REVIEWED_RUNTIME_CONFIG_SHA256??'') ||
   digest!==process.env.REVIEWED_RUNTIME_CONFIG_SHA256)
  throw Error('CANARY_RUNTIME_CONFIGURATION_NOT_OWNER_REVIEWED');
writeFileSync('workers/control-plane/wrangler.runtime.jsonc',source,{mode:0o600});
console.log('CANARY_CONFIG_VALID_DB_AND_HOT50_V2_FLAG=true');
