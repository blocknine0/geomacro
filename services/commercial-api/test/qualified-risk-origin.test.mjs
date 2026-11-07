import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createQualifiedRiskResolver} from '../src/qualified-risk.mjs';

const direct='https://geomacro-control-plane.daspallab202391.workers.dev';
test('approved direct evidence endpoint remains strictly qualified and never charges',async()=>{
 let count=0;
 const resolve=createQualifiedRiskResolver({origin:direct,token:'a'.repeat(64),fetchImpl:async(url,options)=>{
  count++;
  assert.equal(url,direct+'/v1/risk-gate/unified/evaluate');
  assert.equal(options.method,'POST');assert.equal(options.redirect,'manual');
  assert.equal(options.headers.Authorization,'Bearer '+'a'.repeat(64));
  assert(!Object.hasOwn(options.headers,'PAYMENT-SIGNATURE'));
  return Response.json({ok:false,error:'NOT_READY_NO_CHARGE'},{status:503});
 }});
 await assert.rejects(resolve({subject:'USA',tier:'basic'}),/QUALIFIED_EVIDENCE_UNAVAILABLE/);
 assert.equal(count,1);
 assert.throws(()=>createQualifiedRiskResolver({origin:'https://unknown.example',token:'a'.repeat(64)}),
  /RISK_ORIGIN_NOT_APPROVED/);
});
test('Worker and protected deploy consistently pin direct control-plane while funds stay OFF',()=>{
 const worker=readFileSync(new URL('../src/worker.mjs',import.meta.url),'utf8');
 const deploy=readFileSync(new URL('../../../scripts/ops/deploy-commercial-api.mjs',import.meta.url),'utf8');
 assert(worker.includes("origin:env.RISK_EVIDENCE_ORIGIN??'"+direct+"'"));
 assert(deploy.includes("RISK_EVIDENCE_ORIGIN:'"+direct+"'"));
 assert(deploy.includes('const commercialNoFundsOnly=true;'));
 assert(deploy.includes("POLYGON_X402_ENABLED:'false'"));
});
