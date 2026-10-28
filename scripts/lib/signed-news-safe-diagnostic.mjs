/**
 * Sanitized private/public signed-derived-news validation failure taxonomy.
 * Never log the native Error, source URL, response body, hash, private key,
 * article text, key id or partner information. An allowlist prevents any
 * upstream/error-message injection from entering CI logs.
 */
const SAFE=new Set([
 "SIGNED_NEWS_KEY_CONFLICT","SIGNED_NEWS_REGISTERED_KEYS_REQUIRED",
 "SIGNED_NEWS_NO_RETAINED_INPUT","SIGNED_NEWS_HTTP_UNAVAILABLE",
 "SIGNED_NEWS_RESPONSE_OVERSIZE","SIGNED_NEWS_PAGE_CONTRACT",
 "SIGNED_NEWS_IDENTITY_OR_COVERAGE","SIGNED_NEWS_ITEM_NOT_SIGNED",
 "SIGNED_NEWS_SIGNATURE_INVALID","SIGNED_NEWS_CATEGORY_UNTRUSTED",
 "SIGNED_NEWS_PAGE_COUNT_INVALID",
 "SIGNED_NEWS_PROOF_BINDING","SIGNED_NEWS_AUTHORITY_OR_CLOCK",
 "SIGNED_NEWS_SOURCE_STATUS","SIGNED_NEWS_INCOMPLETE_COVERAGE",
 "SIGNED_NEWS_CURSOR","SIGNED_NEWS_PAGE_LIMIT",
 "SIGNED_NEWS_JOURNAL_CHANGED_REPEATEDLY",
 "SIGNED_NEWS_RESPONSE_JSON_INVALID","PRIVATE_NEWS_PROOF_TOKEN_MISSING",
 "DERIVED_NEWS_PAGE_CLOCK_INVALID","DERIVED_NEWS_PAGE_UNAVAILABLE",
 "DERIVED_NEWS_PAGE_TOO_LARGE","DERIVED_NEWS_PAGE_CONTRACT_INVALID",
 "DERIVED_NEWS_PUBLIC_DOCUMENT_INVALID","DERIVED_NEWS_PAGE_DUPLICATE_ID",
 "DERIVED_NEWS_PAGE_CURSOR_INVALID","DERIVED_NEWS_PAGINATION_INCOMPLETE",
 "AUTOMATED_INPUT_ENVELOPE_INVALID","AUTOMATED_INPUT_CONTRACT_INVALID",
 "AUTOMATED_INPUT_CLOCK_INVALID","AUTOMATED_INPUT_STORY_INVALID",
 "AUTOMATED_INPUT_KEY_INVALID","AUTOMATED_INPUT_KEY_LIFECYCLE_INVALID",
 "AUTOMATED_INPUT_SIGNATURE_INVALID"
]);
export function safeSignedNewsReason(error){
 const reason=error instanceof Error?error.message:"";
 return SAFE.has(reason)?reason:"SIGNED_NEWS_UNCLASSIFIED_OR_NETWORK_FAILURE";
}
export function safeSignedNewsFailureReceipt(error){
 return Object.freeze({
  schema:"geomacro.signed-news-readback-sanitized-failure.v1",
  valid_signed_derived_receipt_available:false,
  machine_signature_authorized_by_this_result:false,
  reason:safeSignedNewsReason(error),
  source_material_logged:false,private_keys_logged:false,
  legal_commercial_rights_claimed:false,
  scored_gri_updated:false,paid_delivery_authorized:false,
  supabase_requests:0,real_payments:0
 });
}