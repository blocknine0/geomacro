import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateKey,createPublicKey,createHash} from 'node:crypto';
import {provisionPrivateLowReviewAuthority} from './provision-private-low-review-authority.mjs';
function harness(initial=[]){
 const secrets=new Map(initial.map(n=>[n,'existing'])),calls=[];
 return {secrets,calls,run:(command,args,options)=>{
  assert.equal(command,'gh');assert.equal(options.shell,false);calls.push({args,options});
  if(args[0]==='auth')return {status:0,stdout:''};
  assert.equal(args[args.indexOf('--repo')+1],'blocknine0/geomacro');
  assert.equal(args[args.indexOf('--env')+1],'production');
  if(args[1]==='list')return {status:0,stdout:JSON.stringify([...secrets.keys()].map(name=>({name})))};
  secrets.set(args[2],options.input);return {status:0,stdout:''};
 }};
}
test('provisions a matching dedicated key and pin through stdin without disclosing values',()=>{
 const h=harness(),result=provisionPrivateLowReviewAuthority({apply:true,run:h.run});
 assert.equal(result.configuration,'PROVISIONED');assert.equal(result.live_review_verified,false);
 const privateValue=h.secrets.get('GEOMACRO_LOW_REVIEW_PRIVATE_PKCS8_B64');
 const priv=createPrivateKey({key:Buffer.from(privateValue,'base64'),format:'der',type:'pkcs8'});
 const pub=createPublicKey(h.secrets.get('GEOMACRO_LOW_REVIEW_PUBLIC_PEM'));
 assert.equal(priv.asymmetricKeyType,'ed25519');
 const der=createPublicKey(priv).export({format:'der',type:'spki'});
 assert.deepEqual(der,pub.export({format:'der',type:'spki'}));
 assert.equal(createHash('sha256').update(der).digest('hex'),h.secrets.get('GEOMACRO_LOW_REVIEW_PUBLIC_SHA256'));
 assert.ok(!JSON.stringify(result).includes(privateValue));
 assert.ok(h.calls.every(c=>!JSON.stringify(c.args).includes(privateValue)));
 const before=h.calls.length;assert.equal(provisionPrivateLowReviewAuthority({apply:true,run:h.run}).changed,false);
 assert.ok(h.calls.slice(before).every(c=>c.args[1]!=='set'));
});
test('check mode makes no writes and partial configuration is never silently rotated',()=>{
 const h=harness();assert.equal(provisionPrivateLowReviewAuthority({run:h.run}).configuration,'ABSENT');
 assert.equal(h.secrets.size,0);
 const partial=harness(['GEOMACRO_LOW_REVIEW_PRIVATE_PKCS8_B64']);
 assert.throws(()=>provisionPrivateLowReviewAuthority({apply:true,run:partial.run}),/NO_KEY_OVERWRITE/);
 assert.ok(partial.calls.every(c=>c.args[1]!=='set'));
});
test('interrupted provisioning reports partial state without exposing CLI stderr or replacing keys',()=>{
 const h=harness();
 const run=(command,args,options)=>args[1]==='set'&&args[2]==='GEOMACRO_LOW_REVIEW_PUBLIC_PEM'
  ?{status:1,stderr:'synthetic confidential credential detail'}:h.run(command,args,options);
 assert.throws(()=>provisionPrivateLowReviewAuthority({apply:true,run}),
  /^Error: PARTIAL_CONFIGURATION_REQUIRES_OWNER_RECOVERY_NO_KEY_OVERWRITE$/);
 const existing=h.secrets.get('GEOMACRO_LOW_REVIEW_PRIVATE_PKCS8_B64');
 assert.throws(()=>provisionPrivateLowReviewAuthority({apply:true,run:h.run}),/NO_KEY_OVERWRITE/);
 assert.equal(h.secrets.get('GEOMACRO_LOW_REVIEW_PRIVATE_PKCS8_B64'),existing);
});
