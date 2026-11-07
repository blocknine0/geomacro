#!/usr/bin/env node
/** Local one-time install; does not touch any provider or authorize funds. */
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
const path='package.json';
if(!existsSync(path)||!existsSync('config/d1-hotspot-v2-canary.hold'))
 throw Error('GEOMACRO_REPO_ROOT_AND_CANARY_HOLD_REQUIRED');
const doc=JSON.parse(readFileSync(path,'utf8'));
if(doc.name!=='geomacro'||doc.private!==true||doc.type!=='module')
 throw Error('GEOMACRO_PACKAGE_IDENTITY_MISMATCH');
doc.scripts={...doc.scripts,
 'release:remediate':'node --experimental-strip-types scripts/release-remediate.ts',
 'release:migrate':'node --experimental-strip-types scripts/apply-d1-migrations.ts --apply',
 'release:canary':'node --experimental-strip-types scripts/canary-promoter.ts --promote',
 'release:quota':'node --experimental-strip-types scripts/verify-d1-quota-proof.ts',
 'release:parity':'node --experimental-strip-types scripts/certify-b2-parity.ts',
 'release:hot50':'node --experimental-strip-types src/risk/hot50Attestation.ts'};
writeFileSync(path,JSON.stringify(doc,null,2)+'\n');
console.log('GeoMacro release commands installed; no provider action or payment performed');
