import {createHash,createPublicKey,timingSafeEqual} from "node:crypto";

// Single server-side authority for manual and qualified on-demand acceptance.
// Public-key material only; no key generation, B2, D1, Supabase or payment.
const FAIL="ON_DEMAND_LIVE_GRO_ACCEPTANCE_FAILED";

export function assertIndependentReviewerKeyAuthority({
  reviewer_public_key_pem,reviewer_public_key_sha256,
  gro_signing_public_key_spki_b64,
}:{
  reviewer_public_key_pem:string;
  reviewer_public_key_sha256:string;
  gro_signing_public_key_spki_b64:string;
}):void{
  if(typeof reviewer_public_key_pem!=="string" ||
     typeof reviewer_public_key_sha256!=="string" ||
     !/^[a-f0-9]{64}$/.test(reviewer_public_key_sha256) ||
     typeof gro_signing_public_key_spki_b64!=="string" ||
     !/^[A-Za-z0-9+/]+={0,2}$/.test(gro_signing_public_key_spki_b64))
    throw Error(FAIL);
  try {
    const review=createPublicKey(reviewer_public_key_pem);
    const commercial=createPublicKey({
      key:Buffer.from(gro_signing_public_key_spki_b64,"base64"),
      format:"der",type:"spki",
    });
    if(review.asymmetricKeyType!=="ed25519" ||
       commercial.asymmetricKeyType!=="ed25519")throw Error(FAIL);
    const reviewDer=review.export({format:"der",type:"spki"}) as Buffer;
    const commercialDer=commercial.export({format:"der",type:"spki"}) as Buffer;
    const actualFingerprint=createHash("sha256").update(reviewDer).digest();
    const approvedFingerprint=Buffer.from(reviewer_public_key_sha256,"hex");
    if(!timingSafeEqual(actualFingerprint,approvedFingerprint) ||
       (reviewDer.length===commercialDer.length &&
        timingSafeEqual(reviewDer,commercialDer)))
      throw Error(FAIL);
  }catch{throw Error(FAIL);}
}

export function approvedIndependentReviewerFromEnv():string|null{
  const pem=process.env.GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM;
  const pinned=process.env.GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_SHA256;
  const signing=process.env.RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64;
  try{
    assertIndependentReviewerKeyAuthority({
      reviewer_public_key_pem:pem as string,
      reviewer_public_key_sha256:pinned as string,
      gro_signing_public_key_spki_b64:signing as string,
    });
    return pem!;
  }catch{return null;}
}
