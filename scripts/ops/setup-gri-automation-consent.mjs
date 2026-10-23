#!/usr/bin/env node
// Setup only: new genuine two-person consent. Never publishes/scores GRI.
import {readFileSync,writeFileSync,lstatSync,realpathSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {generateKeyPairSync,createPrivateKey} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline/promises';
import {readHumanKeyPassphrase} from '../lib/read-human-key-passphrase.mjs';
import {spkiDigest} from '../lib/standing-derived-delegation.mjs';
import {makeGriAutomationPolicy,signGriAutomationConsent,prepareGriAutomationEnrollment,
 ENVELOPE,ROLES} from '../lib/gri-automation-consent.mjs';
let phase='LOCAL_INTERACTIVE_ENTRY';
const REPO='blocknine0/geomacro',fail=()=>{throw Error('GRI_AUTOMATION_CONSENT_SETUP_REFUSED')};
function read(p,privateOnly=true){
 if(!isAbsolute(p??''))fail();
 const s=lstatSync(p);
 if(!s.isFile()||s.isSymbolicLink()||s.size<1||s.size>24000||
  privateOnly&&process.platform!=='win32'&&(s.mode&0o077)!==0)fail();
 return readFileSync(p,'utf8');
}
const json=p=>JSON.parse(read(p));
const write=(p,v)=>writeFileSync(p,typeof v==='string'?v:JSON.stringify(v,null,2)+'\n',{flag:'wx',mode:0o600});
function privateDir(p){
 if(!isAbsolute(p)||realpathSync(p)!==p||!lstatSync(p).isDirectory()||
  process.platform!=='win32'&&(lstatSync(p).mode&0o077)!==0)fail();
 const rel=relative(realpathSync(process.cwd()),p);
 if(rel===''||!rel.startsWith('..')&&!isAbsolute(rel))fail();
}
async function confirm(message,phrase){
 const rl=createInterface({input:process.stdin,output:process.stdout});
 try{console.log(message);if(await rl.question('Type '+phrase+': ')!==phrase)fail()}finally{rl.close()}
}
function run(cmd,args,input){
 const r=spawnSync(cmd,args,{input,encoding:'utf8',timeout:30000,maxBuffer:65536,stdio:['pipe','pipe','pipe']});
 if(r.error||r.status!==0)fail();return r.stdout.trim();
}
export async function main(env=process.env){
 if(!process.stdin.isTTY||!process.stdout.isTTY||env.CI==='true'||env.GITHUB_ACTIONS==='true'||
  !env.HOME||process.argv.length!==3)fail();
 const mode=process.argv[2],isReviewer=mode==='--sign-reviewer';
 const dir=env.GEOMACRO_GRI_CONSENT_DIR||resolve(env.HOME,
  'geomacro-private',isReviewer?'suman':'pallab','gri-automation-v1');
 const ownerDir=resolve(env.HOME,'geomacro-private/pallab');
 if(mode==='--prepare'){
  phase='NEW_DIRECTORY_AND_EXISTING_HUMAN_PUBLIC_KEYS';
  if(existsSync(dir))fail();
  const ownerPem=read(join(ownerDir,'owner-public.pem'),false);
  const reviewerPem=read(join(ownerDir,'delegation/suman-public.pem'),false);
  // Existing humans are reused; ONLY dedicated machine keypairs are created.
  const owner=generateKeyPairSync('ed25519'),review=generateKeyPairSync('ed25519');
  const pub=k=>k.publicKey.export({format:'pem',type:'spki'}).toString();
  const priv=k=>k.privateKey.export({format:'pem',type:'pkcs8'}).toString();
  const policy=makeGriAutomationPolicy({ownerPem,reviewerPem,ownerMachinePem:pub(owner),reviewMachinePem:pub(review)});
  mkdirSync(dir,{mode:0o700});privateDir(dir);
  for(const [name,value] of Object.entries({'owner-public.pem':ownerPem,'suman-public.pem':reviewerPem,
   'owner-machine-public.pem':pub(owner),'owner-machine-private.pem':priv(owner),
   'review-machine-public.pem':pub(review),'review-machine-private.pem':priv(review),'policy.json':policy}))
   write(join(dir,name),value);
  console.log('NEW_GRI_AUTOMATION_POLICY_PREPARED_UNSIGNED_NO_PUBLISHER_ACTIVATION');return;
 }
 phase='EXISTING_PRIVATE_POLICY_DIRECTORY';
 privateDir(dir);
 const policy=json(join(dir,'policy.json'));
 if(mode==='--sign-owner'||isReviewer){
  phase='EXISTING_PERSONAL_ENCRYPTED_SIGNING_KEY';
  const humanDir=resolve(env.HOME,'geomacro-private',isReviewer?'suman':'pallab');
  const keyPath=env.GEOMACRO_GRI_CONSENT_HUMAN_KEY_PATH||join(humanDir,
   isReviewer?'reviewer-private-encrypted.pem':'owner-private-encrypted.pem');
  const raw=read(keyPath);
  if(!raw.slice(0,90).includes('BEGIN ENCRYPTED PRIVATE KEY'))fail();
  await confirm('Authorize automated policy checks for GRI, NOT human per-batch review.\n'+
   'Evidence, rights approvals, original clocks, canonical scoring and B2/D1 checks remain required.\n'+
   'No source-rights grant, fabricated certificates or payment. Policy is revocable.\n'+
   'Role: '+(isReviewer?ROLES[1]:ROLES[0])+'\nRead local policy.json before signing.',
   'AUTHORIZE RULE BASED GRI AUTOMATION');
  phase='PERSONAL_CONSENT_AND_KEY_MATCH';
  const passphrase=await readHumanKeyPassphrase('Enter YOUR encrypted human key passphrase (hidden): ');
  const approval=signGriAutomationConsent(policy,isReviewer?ROLES[1]:ROLES[0],createPrivateKey({key:raw,passphrase}));
  write(join(dir,isReviewer?'suman-approval.json':'owner-approval.json'),approval);
  console.log('GENUINE_GRI_POLICY_CONSENT_WRITTEN_LOCAL_ONLY');return;
 }
 if(mode!=='--enroll')fail();
 phase='EXACT_TWO_SIGNED_CONSENTS_AND_MACHINE_KEYS';
 const envelope={schema:ENVELOPE,policy,approvals:[json(join(dir,'owner-approval.json')),json(join(dir,'suman-approval.json'))]};
 const {secrets,receipt}=prepareGriAutomationEnrollment({envelope,
  ownerPem:read(join(dir,'owner-public.pem'),false),reviewerPem:read(join(dir,'suman-public.pem'),false),
  ownerMachinePem:read(join(dir,'owner-machine-public.pem'),false),
  reviewMachinePem:read(join(dir,'review-machine-public.pem'),false),
  ownerMachinePrivatePem:read(join(dir,'owner-machine-private.pem')),
  reviewMachinePrivatePem:read(join(dir,'review-machine-private.pem'))});
 const gh=(args,input)=>run('gh',args,input);
 phase='CLEAN_EXACT_CURRENT_MAIN';
 const local=run('git',['rev-parse','HEAD']);
 if(!/^[a-f0-9]{40}$/.test(local)||
  gh(['api','repos/'+REPO+'/commits/main','--jq','.sha'])!==local||run('git',['status','--porcelain'])!=='')fail();
 await confirm('Both exact human consents verified. Upload ONLY dedicated machine keys and signed policy.\n'+
  'Existing human keys and old derived delegation stay unchanged. GRI publisher integration remains pending.',
  'ENROLL GRI AUTOMATION CONSENT NO FUNDS');
 phase='GITHUB_PROTECTED_ENROLLMENT';
 gh(['variable','set','GEOMACRO_GRI_AUTO_ENROLLED','--repo',REPO,'--body','NO']);
 for(const [name,value] of Object.entries(secrets))gh(['secret','set',name,'--repo',REPO,'--env','production'],value);
 const names=JSON.parse(gh(['secret','list','--repo',REPO,'--env','production','--json','name']));
 if(!Array.isArray(names)||Object.keys(secrets).some(n=>!names.some(x=>x.name===n)))fail();
 gh(['variable','set','GEOMACRO_GRI_AUTO_REVOKED','--repo',REPO,'--body','NO']);
 gh(['variable','set','GEOMACRO_GRI_AUTO_ENROLLED','--repo',REPO,'--body','YES_CONSENT_ONLY']);
 gh(['workflow','run','gri-automation-consent-readiness.yml','--repo',REPO,'--ref','main']);
 console.log(JSON.stringify({...receipt,status:'CONSENT_ENROLLED_AWAIT_PROTECTED_READINESS',
  human_private_keys_uploaded:false,machine_private_keys_cloud_verified:false,publisher_enabled:false}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 main().catch(()=>{console.error(JSON.stringify({error:'GRI_AUTOMATION_CONSENT_SETUP_REFUSED_NO_PUBLICATION',phase,publisher_enabled:false,payments:0}));process.exitCode=2});
