#!/usr/bin/env node
// Public identities + signed consent only. No private keys or source/B2 reads.
import {verifyGriAutomationConsent} from '../lib/gri-automation-consent.mjs';
import {createPublicKey} from 'node:crypto';
import {appendFileSync} from 'node:fs';
import {spkiDigest} from '../lib/standing-derived-delegation.mjs';
import {verifyStandingGriOwnerPublicationPolicy} from '../lib/gri-standing-owner-publication-policy.mjs';
try{
 const e=process.env;
 if(e.GITHUB_REPOSITORY!=='blocknine0/geomacro'||e.GITHUB_REF!=='refs/heads/main'||
  e.GEOMACRO_GRI_AUTO_ENROLLED!=='YES_CONSENT_ONLY')throw Error('NOT_ENROLLED');
 const bytes=e.GEOMACRO_GRI_AUTO_POLICY_ENVELOPE_B64??'';
 if(bytes.length<200||bytes.length>24000)throw Error('SIZE');
 const gro=createPublicKey({key:Buffer.from(e.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64??'','base64'),format:'der',type:'spki'});
 const result=verifyGriAutomationConsent({envelope:JSON.parse(Buffer.from(bytes,'base64').toString('utf8')),
  ownerPem:e.GEOMACRO_DELEGATION_OWNER_PUBLIC_KEY_PEM,ownerPin:e.GEOMACRO_DELEGATION_OWNER_PUBLIC_KEY_SHA256,
  reviewerPem:e.GEOMACRO_DELEGATION_SUMAN_PUBLIC_KEY_PEM,reviewerPin:e.GEOMACRO_DELEGATION_SUMAN_PUBLIC_KEY_SHA256,
  ownerMachinePem:e.GEOMACRO_GRI_AUTO_OWNER_MACHINE_PUBLIC_PEM,
  reviewMachinePem:e.GEOMACRO_GRI_AUTO_REVIEW_MACHINE_PUBLIC_PEM,
  otherAuthorityPins:[e.GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_SHA256,e.GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_SHA256,spkiDigest(gro)],
  revoked:e.GEOMACRO_GRI_AUTO_REVOKED});
 const standing=e.GEOMACRO_GRI_STANDING_OWNER_ADMISSION==='VERIFIED_INPUTS_ONLY'
  ?verifyStandingGriOwnerPublicationPolicy({env:e}):null;
 if(standing&&e.GITHUB_OUTPUT)appendFileSync(e.GITHUB_OUTPUT,'standing_owner_policy_verified=true\n');
 console.log(JSON.stringify({...result,machine_private_keys_cloud_verified:false,
  ...(standing?{standing_owner_publication_policy:standing}: {})}));
}catch{console.error('GRI_AUTOMATION_CONSENT_NOT_VERIFIED_NO_PUBLISHER_ACTIVATION');process.exitCode=2}
