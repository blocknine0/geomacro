import {describe,it,expect} from 'vitest';
import {generateKeyPairSync,createHash} from 'node:crypto';
import {signedPublicationRecoveryPreflight} from '../lib/signed-publication-recovery-preflight.server';

const reviewer=generateKeyPairSync('ed25519').publicKey;
const signing=generateKeyPairSync('ed25519').publicKey;
const der=reviewer.export({format:'der',type:'spki'});
const pem=reviewer.export({format:'pem',type:'spki'}).toString();
const env={
  GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM:pem,
  GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256:createHash('sha256').update(der).digest('hex'),
  RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64:signing.export({format:'der',type:'spki'}).toString('base64'),
  GRO_SIGNER_PRIVATE_CONFIGURED:'true',B2_WRITER_CONFIGURED:'true',B2_ARCHIVE_READER_CONFIGURED:'true',
  D1_CONTROL_PLANE_CONFIGURED:'true',PUBLICATION_AUTH_CONFIGURED:'true',
};
describe('signed recovery preflight cannot turn source/API/key presence into publication',()=>{
  it('accepts a pinned distinct public authority without asserting reviewed evidence or live readiness',()=>{
    const r=signedPublicationRecoveryPreflight(env);
    expect(r.configuration_preflight_passed).toBe(true);
    expect(r.independent_review_authority_verified).toBe(true);
    expect(r.reviewed_input_packages_checked).toBe(false);
    expect(r.current_signed_product_verified).toBe(false);
    expect(r.publication_performed).toBe(false);
    expect(r.b2_requests+r.d1_writes+r.supabase_requests+r.payments).toBe(0);
    expect(JSON.stringify(r)).not.toContain(pem);
    expect(JSON.stringify(r)).not.toContain(env.GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256);
  });
  it('rejects missing, wrong-pinned and self-review authority while preserving all blockers',()=>{
    for(const bad of [{},{...env,GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256:'0'.repeat(64)},
      {...env,RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64:der.toString('base64')}]){
      const r=signedPublicationRecoveryPreflight(bad);
      expect(r.configuration_preflight_passed).toBe(false);
      expect(r.blockers).toContain('APPROVED_DISTINCT_INDEPENDENT_REVIEW_AUTHORITY_REQUIRED');
    }
    const missing=signedPublicationRecoveryPreflight({GROQ_API_KEY:'private-key',OWNER_PRIVATE_KEY:'private-key'});
    expect(missing.blockers).toContain('CONFIGURATION_MISSING_GRO_SIGNER_PRIVATE');
    expect(JSON.stringify(missing)).not.toContain('private-key');
  });
});

const rights=generateKeyPairSync('ed25519').publicKey;
const machineEnv={...env,GEOMACRO_PUBLICATION_PROFILE:'GEOMACRO_AUTOMATED_CROSS_SOURCE_NOT_EXTERNAL_REVIEWED_V1',
  GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM:undefined,GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256:undefined,
  GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_PEM:pem,
  GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_SHA256:createHash('sha256').update(der).digest('hex'),
  GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_PEM:rights.export({format:'pem',type:'spki'}).toString(),
  GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_SHA256:createHash('sha256').update(rights.export({format:'der',type:'spki'})).digest('hex'),
};
describe('explicit machine configuration uses the actual dual-authority verifier',()=>{
  it('does not incorrectly require an external reviewer or assert real evidence/publication',()=>{
    const r=signedPublicationRecoveryPreflight(machineEnv);
    expect(r.configuration_preflight_passed).toBe(true);
    expect(r.machine_authority_configuration_verified).toBe(true);
    expect(r.independent_review_authority_verified).toBe(false);
    expect(r.machine_signed_facts_and_rights_input_checked).toBe(false);
    expect(r.public_delivery_wiring_checked).toBe(false);
    expect(r.current_signed_product_verified).toBe(false);
    expect(r.publication_performed).toBe(false);
    expect(r.b2_requests+r.d1_writes+r.supabase_requests+r.payments).toBe(0);
    expect(JSON.stringify(r)).not.toContain(pem);
    expect(JSON.stringify(r)).not.toContain(machineEnv.GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_SHA256);
  });
  it('rejects missing/mispinned/reused authorities and non-Ed25519 GRO keys',()=>{
    const rsa=generateKeyPairSync('rsa',{modulusLength:2048}).publicKey;
    for(const patch of [
      {GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_PEM:undefined},
      {GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_SHA256:'0'.repeat(64)},
      {GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_PEM:pem,GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_SHA256:machineEnv.GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_SHA256},
      {RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64:der.toString('base64')},
      {RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64:rsa.export({format:'der',type:'spki'}).toString('base64')},
    ]){
      const r=signedPublicationRecoveryPreflight({...machineEnv,...patch});
      expect(r.configuration_preflight_passed).toBe(false);
      expect(r.blockers).toContain('APPROVED_DISTINCT_MACHINE_FACTS_AND_RIGHTS_AUTHORITIES_REQUIRED');
    }
  });
  it('never silently selects a weaker profile from a typo or the presence of machine keys',()=>{
    expect(signedPublicationRecoveryPreflight({...machineEnv,GEOMACRO_PUBLICATION_PROFILE:'automatic'}).blockers)
      .toContain('PUBLICATION_AUTHORITY_PROFILE_INVALID');
    const r=signedPublicationRecoveryPreflight({...machineEnv,GEOMACRO_PUBLICATION_PROFILE:undefined});
    expect(r.authority_profile).toBe('INDEPENDENT_REVIEWED');
    expect(r.configuration_preflight_passed).toBe(false);
    expect(r.blockers).toContain('APPROVED_DISTINCT_INDEPENDENT_REVIEW_AUTHORITY_REQUIRED');
  });
});
