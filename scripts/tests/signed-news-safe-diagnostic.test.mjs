import test from "node:test";
import assert from "node:assert/strict";
import {safeSignedNewsReason,safeSignedNewsFailureReceipt} from "../lib/signed-news-safe-diagnostic.mjs";
test("known exact contract/readback status is exposed without source data",()=>{
 const r=safeSignedNewsFailureReceipt(new Error("SIGNED_NEWS_ITEM_NOT_SIGNED"));
 assert.equal(r.reason,"SIGNED_NEWS_ITEM_NOT_SIGNED");
 assert.equal(r.machine_signature_authorized_by_this_result,false);
 assert.equal(r.paid_delivery_authorized,false);
});
test("unknown or injected error content never leaks to logs",()=>{
 for(const value of [
  new Error("SIGNED_NEWS_ITEM_NOT_SIGNED https://private-publisher.example/news"),
  new Error("Error: test private PEM-----BEGIN"),
  new Error("DERIVED_NEWS_PAGE_UNAVAILABLE\ncredential=secret"),
  "SIGNED_NEWS_PAGE_CONTRACT",
  new Error("fetch failed")
 ]){
  const receipt=safeSignedNewsFailureReceipt(value);
  const json=JSON.stringify(receipt);
  assert.equal(receipt.reason,"SIGNED_NEWS_UNCLASSIFIED_OR_NETWORK_FAILURE");
  assert.doesNotMatch(json,/https?:|publisher|credential|BEGIN|secret|fetch failed|private PEM/u);
  assert.equal(receipt.real_payments,0);
 }
});
test("whitelisted native error cannot indicate publication or commercial rights",()=>{
 for(const code of ["SIGNED_NEWS_PAGE_CONTRACT","DERIVED_NEWS_PAGE_UNAVAILABLE",
   "AUTOMATED_INPUT_SIGNATURE_INVALID"]){
  const receipt=safeSignedNewsFailureReceipt(new Error(code));
  assert.equal(safeSignedNewsReason(new Error(code)),code);
  assert.equal(receipt.legal_commercial_rights_claimed,false);
  assert.equal(receipt.scored_gri_updated,false);
 }
});
test("live signed-news failures distinguish journal churn and malformed JSON without leaking details",()=>{
 for(const code of ["SIGNED_NEWS_JOURNAL_CHANGED_REPEATEDLY",
  "SIGNED_NEWS_RESPONSE_JSON_INVALID","PRIVATE_NEWS_PROOF_TOKEN_MISSING"]){
  const result=safeSignedNewsFailureReceipt(new Error(code));
  assert.equal(result.reason,code);
  assert.equal(result.valid_signed_derived_receipt_available,false);
  assert.equal(result.source_material_logged,false);
  assert.equal(result.paid_delivery_authorized,false);
 }
 assert.equal(safeSignedNewsReason(new Error(
  "SIGNED_NEWS_RESPONSE_JSON_INVALID raw=https://internal.example")), 
  "SIGNED_NEWS_UNCLASSIFIED_OR_NETWORK_FAILURE");
});

test("journal count, issuer tamper and category errors are diagnostic-only, never authorize delivery",()=>{
 for(const code of ["SIGNED_NEWS_PAGE_COUNT_INVALID",
  "SIGNED_NEWS_SIGNATURE_INVALID","SIGNED_NEWS_CATEGORY_UNTRUSTED"]){
  const receipt=safeSignedNewsFailureReceipt(new Error(code));
  assert.equal(receipt.reason,code);
  assert.equal(receipt.valid_signed_derived_receipt_available,false);
  assert.equal(receipt.machine_signature_authorized_by_this_result,false);
  assert.equal(receipt.paid_delivery_authorized,false);
  assert.equal(receipt.private_keys_logged,false);
 }
});

test('canonical D1 bundle and quota failures are exact, redacted and never commercial approval',()=>{
 for(const code of [
  'DERIVED_NEWS_BUNDLE_STALE_READBACK',
  'DERIVED_NEWS_BUNDLE_UNAVAILABLE',
  'DERIVED_NEWS_BUNDLE_TOO_LARGE',
  'DERIVED_NEWS_BUNDLE_JSON_INVALID',
  'DERIVED_NEWS_BUNDLE_CONTRACT_INVALID',
  'DERIVED_NEWS_BUNDLE_DUPLICATE_ID',
  'DERIVED_NEWS_PUBLIC_FETCH_UNAVAILABLE',
  'DERIVED_NEWS_PUBLIC_FETCH_D1_DAILY_ROW_READ_LIMIT',
  'DERIVED_NEWS_PUBLIC_FETCH_D1_DAILY_ROW_WRITE_LIMIT',
  'DERIVED_NEWS_PUBLIC_FETCH_D1_STORAGE_LIMIT',
  'DERIVED_NEWS_PUBLIC_FETCH_D1_OVERLOADED',
  'DERIVED_NEWS_PUBLIC_FETCH_D1_TRANSIENT',
  'DERIVED_NEWS_PUBLIC_FETCH_D1_SCHEMA_OR_SQL',
  'DERIVED_NEWS_PUBLIC_FETCH_D1_UNCLASSIFIED',
  'DERIVED_NEWS_PAGE_STALE_READBACK',
 ]){
  const receipt=safeSignedNewsFailureReceipt(new Error(code));
  assert.equal(receipt.reason,code);
  assert.equal(receipt.valid_signed_derived_receipt_available,false);
  assert.equal(receipt.machine_signature_authorized_by_this_result,false);
  assert.equal(receipt.paid_delivery_authorized,false);
  assert.equal(receipt.private_keys_logged,false);
 }
 const unknown=safeSignedNewsFailureReceipt(new Error(
  'DERIVED_NEWS_PUBLIC_FETCH_D1_PRIVATE_SQL_https://example.com/source'));
 assert.equal(unknown.reason,'SIGNED_NEWS_UNCLASSIFIED_OR_NETWORK_FAILURE');
 assert.doesNotMatch(JSON.stringify(unknown),/PRIVATE_SQL|example.com/u);
});
