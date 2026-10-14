import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { publishSupabaseFreePublicIntelligence } from "../lib/supabase-free-public-intelligence-publisher.mjs";
import { SAME_EVENT_QUALIFICATION_SCHEMA, sameEventClaimHash,
  derivedCustomerRowSha256, qualificationReviewSigningBytes } from "../lib/independent-same-event-qualification.mjs";

// Synthetic signed fixtures are confined to this test; no network or funds.
const now = new Date("2026-10-14T12:00:00.000Z");
const keys = generateKeyPairSync("ed25519");
const trustedReviewerPublicKeyPem = keys.publicKey.export({type:"spki",format:"pem"}).toString();
const hash = text => createHash("sha256").update(text).digest("hex");
function fixture() {
  const rows = [], eventPackages = [];
  for (const category of ["geopolitics", "macro", "rare_earth"]) {
    const row = { id: `fixture-${category}`, category, public_status: "verified_b2",
      severity: 60, delta: null,
      source_title: "Geomacro finds verified supply disruption risk elevated",
      summary: "Verified original evidence indicates changed supply conditions",
      published_at: "2026-10-14T11:10:00.000Z", created_at: "2026-10-14T11:30:00.000Z" };
    const event = {country_iso3:"USA",event_type:"trade_disruption",
      actor_id:"fixture_actor",target_id:`fixture_${category}`,location_id:"fixture_location",
      occurred_at:"2026-10-14T11:00:00.000Z"};
    const claim = sameEventClaimHash(category, event);
    const pkg = {schema:SAME_EVENT_QUALIFICATION_SCHEMA,event_id:row.id,category,event,
      same_event_claim_sha256:claim,independent_same_event_review_verified:true,
      same_event_reviewer_receipt_sha256:hash(`review-${category}`),
      reviewed_derived_row_sha256:derivedCustomerRowSha256(row),
      counterevidence_review:{independent_counterevidence_review_completed:true,
        review_receipt_sha256:hash(`counter-${category}`),reviewed_at:"2026-10-14T11:25:00.000Z",
        sources_screened:2,material_conflicts_detected:0,material_conflicts_resolved:0,
        unresolved_material_conflicts:0,retractions_detected:0},
      evidence:["federalreserve", "ecb"].map((source, index) => ({
        url: index ? "https://www.ecb.europa.eu/fixture" : "https://www.federalreserve.gov/fixture",
        publisher_host:index ? "www.ecb.europa.eu" : "www.federalreserve.gov",
        publisher_organization_id:index ? "ecb" : "federal_reserve",
        originating_reporting_organization_id:index ? "ecb" : "federal_reserve",
        native_published_at_verified:true,original_published_at:index ? "2026-10-14T11:15:00.000Z" : row.published_at,
        original_article_content_verified:true,original_article_sha256:hash(`${source}-${category}-bytes`),
        independent_review_sha256:hash(`${source}-${category}-review`),
        rights_receipt_sha256:hash(`${source}-${category}-rights`),
        commercial_derived_use_rights_verified:true,independently_authored_reporting_verified:true,
        reporting_position:"confirms",syndicated_from:null,original_publisher_url_verified:true,
        same_event_claim_sha256:claim,
      }))};
    pkg.review_signature_base64 = sign(null, qualificationReviewSigningBytes(pkg), keys.privateKey).toString("base64");
    rows.push(row); eventPackages.push(pkg);
  }
  return {rows,eventPackages};
}
function harness(input = fixture(), { corrupt = false, slow = false } = {}) {
  const calls = [], stored = new Map(); let clockCalls = 0;
  const options = {...input,trustedReviewerPublicKeyPem,sourceRunId:"1234",
    clock:() => slow && clockCalls++ > 0 ? new Date(now.getTime()+7*3600_000) : now,
    createArchiveClient:() => {calls.push("client"); return {
      put:async (key, bytes) => {calls.push(`put:${key}`); stored.set(key,Buffer.from(bytes));},
      get:async key => {calls.push(`get:${key}`); return corrupt ? Buffer.from("tampered") : stored.get(key);},
    };},
    promoteHotSnapshot:async body => {calls.push("promote"); stored.set("promotion",body);},
  };
  return {options,calls,stored};
}
test("signed three-domain originals publish exact B2 bytes before D1; private evidence stays private", async () => {
  const h = harness(); const report = await publishSupabaseFreePublicIntelligence(h.options);
  assert.equal(report.d1_hot_snapshot_published,true);
  assert.equal(report.supabase_reads,0); assert.equal(report.external_payment_executed,false);
  assert.equal(h.calls.at(-1),"promote");
  const packed = h.stored.get("geomacro-evidence/v1/live/public-intelligence/latest.json.gz");
  const raw = gunzipSync(packed).toString();
  assert.equal(hash(raw),report.payload_sha256);
  assert.equal(hash(packed),report.b2_sha256);
  assert.equal(JSON.parse(raw).rows.length,3);
  for(const [key,value] of h.stored) if(key!=="promotion") {
    const publicText = key.endsWith(".gz") ? gunzipSync(value).toString() : value.toString();
    assert.doesNotMatch(publicText,/federalreserve\.gov|review_signature|eventPackages/);
  }
});
test("missing domain, extra public source URL, changed signed score and untrusted key fail before B2", async () => {
  for (const variant of ["domain","leak","score","key"]) {
    const input = fixture();
    if(variant==="domain"){input.rows.pop();input.eventPackages.pop();}
    if(variant==="leak") input.rows[0].source_url="https://private.invalid";
    if(variant==="score") input.rows[0].severity++;
    const h = harness(input);
    if(variant==="key") h.options.trustedReviewerPublicKeyPem=generateKeyPairSync("ed25519").publicKey.export({type:"spki",format:"pem"}).toString();
    await assert.rejects(publishSupabaseFreePublicIntelligence(h.options));
    assert.deepEqual(h.calls,[]);
  }
});
test("corrupt B2 bytes never overwrite latest or promote D1", async () => {
  const h = harness(fixture(),{corrupt:true});
  await assert.rejects(publishSupabaseFreePublicIntelligence(h.options),/READBACK_MISMATCH/);
  assert.equal(h.calls.includes("promote"),false);
  assert.equal(h.stored.has("geomacro-evidence/v1/live/public-intelligence/latest.json.gz"),false);
});
test("an upload passing the native deadline never refreshes source time or promotes D1", async () => {
  const h = harness(fixture(),{slow:true});
  await assert.rejects(publishSupabaseFreePublicIntelligence(h.options));
  assert.equal(h.calls.includes("promote"),false);
  assert.equal(h.stored.has("geomacro-evidence/v1/live/public-intelligence/latest.json.gz"),false);
});
