#!/usr/bin/env node
/**
 * Restore ONE previously approved PUBLIC Facts PEM in the protected
 * production environment. The EXISTING separately approved SHA256 pin
 * is NOT changed. Production GRI/Facts/rights/signing authorities,
 * Predge, x402 and payments stay untouched.
 */
import {createHash,createPublicKey} from 'node:crypto';
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline/promises';
const REPO='blocknine0/geomacro';
const PIN=/^[a-f0-9]{64}$/u;
const fail=()=>{throw Error('APPROVED_FACTS_PUBLIC_PEM_REPAIR_REFUSED');};
export function prepareFactsPublicPemRepair({pem,approvedPin}={}){
 if(typeof pem!=='string'||pem.length>8192||!PIN.test(approvedPin??'')||
   !/^-----BEGIN PUBLIC KEY-----\r?\n/.test(pem)||
   !/\r?\n-----END PUBLIC KEY-----\s*$/.test(pem)||
   /PRIVATE KEY|BEGIN CERTIFICATE|OPENSSH|\\n/.test(pem))fail();
 let key;try{key=createPublicKey(pem);}catch{fail();}
 if(key.asymmetricKeyType!=='ed25519')fail();
 const pin=createHash('sha256').update(key.export({format:'der',type:'spki'})).digest('hex');
 if(pin!==approvedPin)fail();
 return Object.freeze({approvedPublicPem:pem,
  sha256_matches_local_approved_public_identity:true,
  sha256_pin_change_authorized:false,
  human_or_machine_private_key_uploaded:false,
  private_signing_or_review_claimed:false,
  payment_authorized:false
 });
}
function gh(args,input){
 const x=spawnSync('gh',args,{input,encoding:'utf8',timeout:30000,maxBuffer:32768});
 if(x.status!==0||x.error)fail();
 return (x.stdout||'').trim();
}
async function main(env=process.env){
 if(process.argv.length!==3||process.argv[2]!=='--install-preapproved-public-pem-no-funds'||
   env.CI==='true'||env.GITHUB_ACTIONS==='true'||!process.stdin.isTTY||
   !process.stdout.isTTY||process.getuid?.()===0)fail();
 const source=env.GEOMACRO_APPROVED_FACTS_PUBLIC_PEM_PATH;
 if(typeof source!=='string'||!source.startsWith('/')||!source.trim())fail();
 const path=resolve(source);
 const repoDir=resolve(env.HOME||'/__none__','geomacro');
 if(path===repoDir||path.startsWith(repoDir+sep))fail();
 if(lstatSync(path).isSymbolicLink()||!lstatSync(path).isFile()||
   lstatSync(path).size<64||lstatSync(path).size>8192)fail();
 if(realpathSync(path)!==path)fail();
 const prepared=prepareFactsPublicPemRepair({
  pem:readFileSync(path,'utf8'),
  approvedPin:env.GEOMACRO_APPROVED_FACTS_PUBLIC_SHA256
 });
 gh(['auth','status','-h','github.com']);
 const rl=createInterface({input:process.stdin,output:process.stdout});
 try{
  process.stdout.write('This changes ONLY the approved Facts public PEM in GitHub production; existing SHA pin and ALL human/private keys remain untouched.\n');
  const answer=await rl.question('Type INSTALL EXISTING FACTS PUBLIC KEY ONLY NO FUNDS: ');
  if(answer!=='INSTALL EXISTING FACTS PUBLIC KEY ONLY NO FUNDS')fail();
 }finally{rl.close();}
 gh(['secret','set','GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_PEM',
   '--repo',REPO,'--env','production'],prepared.approvedPublicPem);
 const names=JSON.parse(gh(['secret','list','--repo',REPO,'--env','production','--json','name']));
 if(!Array.isArray(names)||!names.some(x=>x.name==='GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_PEM'))fail();
 // No independent review is manufactured here. Re-read cloud protected pins.
 gh(['workflow','run','pallab-suman-independent-gri-authorities.yml','--repo',REPO,'--ref','main']);
 gh(['workflow','run','hosted-authority-readiness.yml','--repo',REPO,'--ref','main']);
 console.log(JSON.stringify({
  status:'PUBLIC_FACTS_PEM_REENROLLED_READINESS_JOBS_DISPATCHED',
  preapproved_local_spki_pin_verified:true,
  existing_production_sha_pin_changed:false,
  rights_or_gri_signatures_created:false,
  historical_b2_or_current_hot_verified:false,
  predge_modified:false,payments:0,
  next:'Check latest protected authority jobs. Success still does NOT prove signed 3/3.'
 }));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 main().catch(()=>{console.error('APPROVED_FACTS_PUBLIC_PEM_REPAIR_REFUSED');process.exitCode=2;});
