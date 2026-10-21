import {generateKeyPairSync,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const names=['GEOMACRO_LOW_REVIEW_PRIVATE_PKCS8_B64','GEOMACRO_LOW_REVIEW_PUBLIC_PEM','GEOMACRO_LOW_REVIEW_PUBLIC_SHA256'];
const repo='blocknine0/geomacro',environment='production';
export function provisionPrivateLowReviewAuthority({apply=false,run=spawnSync}={}){
 const gh=(args,input)=>{
  const result=run('gh',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],shell:false});
  // Never reflect CLI stderr: authentication helpers may include sensitive details.
  if(result.error||result.status!==0)throw Error('PROTECTED_CONFIGURATION_COMMAND_FAILED');
  return result.stdout;
 };
 const inventory=()=>{
  const rows=JSON.parse(gh(['secret','list','--repo',repo,'--env',environment,'--json','name']));
  if(!Array.isArray(rows))throw Error('SECRET_INVENTORY_INVALID');
  return names.filter(name=>rows.some(row=>row.name===name));
 };
 gh(['auth','status']);
 const existing=inventory();
 if(existing.length===names.length)return {configuration:'PRESENT',values_verified:false,changed:false};
 if(existing.length)throw Error('PARTIAL_CONFIGURATION_REQUIRES_OWNER_RECOVERY_NO_KEY_OVERWRITE');
 if(!apply)return {configuration:'ABSENT',changed:false,action:'RUN_WITH_--provision'};
 // Generate only on the owner machine, after authenticated inventory checks.
 // Private material goes directly to gh stdin; no key files, argv or output.
 const pair=generateKeyPairSync('ed25519');
 const der=pair.publicKey.export({format:'der',type:'spki'});
 const values=[pair.privateKey.export({format:'der',type:'pkcs8'}).toString('base64'),
  pair.publicKey.export({format:'pem',type:'spki'}).toString(),createHash('sha256').update(der).digest('hex')];
 let written=0;
 try{
  for(let i=0;i<names.length;i++){
   gh(['secret','set',names[i],'--repo',repo,'--env',environment],values[i]);written++;
  }
  if(inventory().length!==names.length)throw Error('CONFIGURATION_READBACK_FAILED');
 }catch{
  throw Error(written?'PARTIAL_CONFIGURATION_REQUIRES_OWNER_RECOVERY_NO_KEY_OVERWRITE':'PROTECTED_CONFIGURATION_WRITE_FAILED');
 }finally{values.fill('');}
 return {configuration:'PROVISIONED',changed:true,live_review_verified:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const args=process.argv.slice(2);
  if(args.length>1||args.some(a=>!['--check','--provision'].includes(a)))throw Error('USE_--check_OR_--provision');
  console.log(JSON.stringify(provisionPrivateLowReviewAuthority({apply:args[0]==='--provision'})));
 }catch(error){
  const allowed=['PARTIAL_CONFIGURATION_REQUIRES_OWNER_RECOVERY_NO_KEY_OVERWRITE','PROTECTED_CONFIGURATION_WRITE_FAILED',
   'PROTECTED_CONFIGURATION_COMMAND_FAILED','USE_--check_OR_--provision'];
  console.error(allowed.includes(error.message)?error.message:'PROTECTED_CONFIGURATION_NOT_VERIFIED');process.exitCode=2;
 }
}
