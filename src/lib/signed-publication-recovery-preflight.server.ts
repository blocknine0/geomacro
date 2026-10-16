import {assertIndependentReviewerKeyAuthority} from './independent-reviewer-authority.server';

// Configuration preflight only. It cannot review evidence, manufacture an
// original clock, sign a product, access an archive, or extend snapshot TTLs.
export function signedPublicationRecoveryPreflight(env:Record<string,string|undefined>){
  const present=(key:string)=>typeof env[key]==='string'&&Boolean(env[key]?.trim());
  const configured={
    gro_signer_private:env.GRO_SIGNER_PRIVATE_CONFIGURED==='true',
    gro_signer_public:present('RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64'),
    independent_reviewer_public:present('GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM'),
    independent_reviewer_pin:present('GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256'),
    b2_writer:env.B2_WRITER_CONFIGURED==='true',
    b2_archive_reader:env.B2_ARCHIVE_READER_CONFIGURED==='true',
    d1_control_plane:env.D1_CONTROL_PLANE_CONFIGURED==='true',
    publication_authorization:env.PUBLICATION_AUTH_CONFIGURED==='true',
  };
  let approved=false;
  try{
    assertIndependentReviewerKeyAuthority({
      reviewer_public_key_pem:env.GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM!,
      reviewer_public_key_sha256:env.GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256!,
      gro_signing_public_key_spki_b64:env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64!,
    });
    approved=true;
  }catch{/* Never print keys, fingerprints or parse exceptions. */}
  const blockers:string[]=[];
  if(!approved)blockers.push('APPROVED_DISTINCT_INDEPENDENT_REVIEW_AUTHORITY_REQUIRED');
  for(const [key,value] of Object.entries(configured))if(!value)blockers.push('CONFIGURATION_MISSING_'+key.toUpperCase());
  return {
    schema:'geomacro.signed-publication-recovery-preflight.v1',
    configuration_presence:configured,
    independent_review_authority_verified:approved,
    configuration_preflight_passed:blockers.length===0,
    blockers,
    // Presence is never cryptographic signing proof or a signed input package.
    signer_execution_verified:false,
    reviewed_input_packages_checked:false,
    reviewed_original_freshness_checked:false,
    independently_pinned_history_checked:false,
    current_signed_product_verified:false,
    publication_performed:false,
    source_content_logged:false,
    b2_requests:0,d1_writes:0,supabase_requests:0,payments:0,
  };
}
