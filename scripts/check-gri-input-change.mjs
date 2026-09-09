#!/usr/bin/env node

import process from "node:process";

const METHOD = "gri-v1.2.0";
const PROOF = "gri-proof-v1.2.0";
const CLASSIFICATION = "event-severity-v1.0.5";
const CLASSIFICATION_PROMPT = "risk-desk-filter-v1.0.5";
const STORY = "story-correlation-v1.0.0";
const STORY_PROMPT = "story-match-title-v1.0.0";
const CHANGED_EXIT_CODE = 10;

function fail(message) {
  console.error(`[gri-change-check] ${message}`);
  process.exit(1);
}

const baseUrl = (process.env.APP_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.APP_SUPABASE_SERVICE_ROLE_KEY || "";

if (!baseUrl) fail("APP_SUPABASE_URL or SUPABASE_URL is required");
if (!/^https:\/\//i.test(baseUrl)) fail("Supabase URL must use HTTPS");
if (!serviceKey) fail("SUPABASE_SERVICE_ROLE_KEY or APP_SUPABASE_SERVICE_ROLE_KEY is required");

async function selectOne(table, params) {
  const endpoint = `${baseUrl}/rest/v1/${table}?${params.toString()}`;
  let response;
  try {
    response = await fetch(endpoint, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Accept: "application/json",
      },
    });
  } catch (error) {
    fail(`${table} query failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    fail(`${table} query returned HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
  }
  const rows = await response.json();
  if (!Array.isArray(rows)) fail(`${table} query returned a non-array payload`);
  return rows[0] ?? null;
}

const latestSnapshot = await selectOne(
  "gri_snapshots",
  new URLSearchParams({
    select: "id,as_of,methodology_version,proof_version,verification_status,status",
    status: "eq.published",
    methodology_version: `eq.${METHOD}`,
    proof_version: `eq.${PROOF}`,
    verification_status: "eq.verified",
    order: "as_of.desc",
    limit: "1",
  }),
);

if (!latestSnapshot) {
  console.log(JSON.stringify({ changed: true, reason: "NO_VERIFIED_CURRENT_SNAPSHOT" }));
  process.exit(CHANGED_EXIT_CODE);
}

const asOf = String(latestSnapshot.as_of || "");
if (!Number.isFinite(Date.parse(asOf))) fail(`Latest snapshot has invalid as_of: ${asOf}`);

const directEvent = await selectOne(
  "events",
  new URLSearchParams({
    select: "id,created_at,classification_scored_at",
    classification_version: `eq.${CLASSIFICATION}`,
    classification_prompt_version: `eq.${CLASSIFICATION_PROMPT}`,
    created_at: `gt.${asOf}`,
    order: "created_at.asc",
    limit: "1",
  }),
);

const reassessment = await selectOne(
  "gri_event_assessments",
  new URLSearchParams({
    select: "event_id,classification_scored_at",
    classification_version: `eq.${CLASSIFICATION}`,
    classification_prompt_version: `eq.${CLASSIFICATION_PROMPT}`,
    classification_scored_at: `gt.${asOf}`,
    order: "classification_scored_at.asc",
    limit: "1",
  }),
);

const storyAssignment = await selectOne(
  "gri_story_assignments",
  new URLSearchParams({
    select: "event_id,clustering_scored_at",
    clustering_version: `eq.${STORY}`,
    clustering_prompt_version: `eq.${STORY_PROMPT}`,
    clustering_scored_at: `gt.${asOf}`,
    order: "clustering_scored_at.asc",
    limit: "1",
  }),
);

const reasons = [];
if (directEvent) reasons.push("NEW_CANONICAL_EVENT");
if (reassessment) reasons.push("NEW_CANONICAL_REASSESSMENT");
if (storyAssignment) reasons.push("NEW_CURRENT_STORY_ASSIGNMENT");

const changed = reasons.length > 0;
console.log(JSON.stringify({
  changed,
  reason: changed ? reasons.join(",") : "NO_NEW_CANONICAL_GRI_INPUT",
  snapshotId: latestSnapshot.id,
  snapshotAsOf: asOf,
}));

process.exit(changed ? CHANGED_EXIT_CODE : 0);
