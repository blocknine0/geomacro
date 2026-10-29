/**
 * Choose one existing, explicitly paired B2 WRITE key before any governed
 * upstream fetch or B2 PUT. No requests, fallback retries or secret logging.
 * A dedicated archive writer, if configured as a pair, outranks the legacy
 * general-purpose key. A malformed pair always fails closed instead of
 * reverting to a potentially stale general-purpose credential.
 */
export function selectGovernedB2WriterCredentials(env=process.env){
  const dedicatedId=String(env.B2_ARCHIVE_WRITE_KEY_ID??"").trim();
  const dedicatedSecret=String(env.B2_ARCHIVE_WRITE_APPLICATION_KEY??"").trim();
  if(Boolean(dedicatedId)!==Boolean(dedicatedSecret))
    throw Error("GOVERNED_B2_DEDICATED_WRITE_PAIR_INCOMPLETE");
  const legacyId=String(env.B2_KEY_ID??"").trim();
  const legacySecret=String(env.B2_APPLICATION_KEY??"").trim();
  if(Boolean(legacyId)!==Boolean(legacySecret))
    throw Error("GOVERNED_B2_LEGACY_WRITE_PAIR_INCOMPLETE");
  const dedicated=Boolean(dedicatedId&&dedicatedSecret);
  const accessKey=dedicated?dedicatedId:legacyId;
  const secretKey=dedicated?dedicatedSecret:legacySecret;
  if(!accessKey||!secretKey)
    throw Error("GOVERNED_B2_WRITE_CREDENTIALS_MISSING");
  return Object.freeze({
    accessKey,secretKey,
    // This role label is safe to log; never log actual key IDs.
    role:dedicated?"DEDICATED_ARCHIVE_WRITER":"LEGACY_ARCHIVE_WRITER",
    authenticated:false,
    authorized_bucket:"geomacro-private-archive",
    credential_validation_requires_real_put:true
  });
}
