#!/usr/bin/env node
import { createGriDbClient } from "../lib/gri-db-client.mjs";

const ISO3 = String(process.argv[2] ?? "").trim().toUpperCase();
if (!/^[A-Z]{3}$/.test(ISO3)) throw new Error("Usage: node local-flash-corroborate.mjs ISO3");
if (String(process.env.GRI_DB_MODE ?? "").trim().toLowerCase() !== "direct_postgres") {
  throw new Error("Local corroboration requires GRI_DB_MODE=direct_postgres");
}

const db = createGriDbClient();
const MAX_EVIDENCE_AGE_HOURS = 6;
const MIN_INDEPENDENT_SOURCE_FAMILIES = 2;
const MIN_SIMILARITY = 0.45;
const VERIFICATION_SCORE_THRESHOLD = 65;
const FAMILY_SCORE = 30;
const SIMILARITY_SCORE_WEIGHT = 35;
const COUNTRY_AGREEMENT_SCORE = 15;
const PEER_MAX_DELTA_SECONDS = 3600;

const STOPWORDS = new Set([
  "the","a","an","and","or","but","if","then","than","to","of","in","on","at",
  "for","from","by","with","as","is","are","was","were","be","been","being",
  "it","its","this","that","these","those","says","said","say","according",
  "after","before","over","under","into","amid","about","around","more","new",
  "latest","breaking","update","updates","report","reports","reported","live",
]);

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/['’]s\b/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value) {
  const output = new Set();
  for (const raw of normalize(value).split(" ")) {
    const token = raw.replace(/^[^a-z0-9]+|[^a-z0-9.%$+-]+$/g, "");
    if (!token || STOPWORDS.has(token)) continue;
    if (token.length < 3 && !/^\d/.test(token)) continue;
    output.add(token);
  }
  return output;
}

function similarity(left, right) {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection += 1;
  const union = a.size + b.size - intersection;
  const jaccard = union ? intersection / union : 0;
  const containment = intersection / Math.min(a.size, b.size);
  return Math.max(0, Math.min(1, 0.62 * jaccard + 0.38 * containment));
}

function eventTime(row) {
  const raw = row.published_at ?? row.ingested_at ?? row.last_seen_at;
  const ms = Date.parse(String(raw ?? ""));
  return Number.isFinite(ms) ? ms : null;
}

function deltaSeconds(a, b) {
  const left = eventTime(a);
  const right = eventTime(b);
  return left === null || right === null ? null : Math.round(Math.abs(left - right) / 1000);
}

async function loadCountryRows() {
  const bridge = await db
    .from("live_flash_event_countries")
    .select("flash_id")
    .eq("country_iso3", ISO3)
    .limit(5000);
  if (bridge.error) throw new Error(`country bridge query failed: ${bridge.error.message}`);

  const ids = [...new Set((bridge.data ?? []).map((row) => row.flash_id).filter(Boolean))];
  if (!ids.length) return [];

  const cutoff = new Date(Date.now() - MAX_EVIDENCE_AGE_HOURS * 3600_000).toISOString();
  const rows = [];
  for (let i = 0; i < ids.length; i += 250) {
    const result = await db
      .from("live_flash_events")
      .select("flash_id,source_id,source_record_id,source_channel,published_at,ingested_at,headline,source_url,event_type,signal_category,severity,source_reliability,verification_score,verification_status,first_seen_at,last_seen_at,last_material_update_at,event_family_id,content_hash,source_version,material_update,material_update_reason")
      .in("flash_id", ids.slice(i, i + 250))
      .gte("ingested_at", cutoff)
      .order("ingested_at", { ascending: false });
    if (result.error) throw new Error(`flash query failed: ${result.error.message}`);
    rows.push(...(result.data ?? []));
  }
  return rows.slice(0, 1000);
}

async function ensureFamily(candidate, peer) {
  let familyId = candidate.event_family_id ?? peer.event_family_id ?? null;

  if (candidate.event_family_id && peer.event_family_id && candidate.event_family_id !== peer.event_family_id) {
    return null;
  }

  if (!familyId) {
    const created = await db
      .from("live_flash_event_families")
      .insert({
        signal_category: candidate.signal_category,
        canonical_headline: candidate.headline,
        country_isos: [ISO3],
        first_seen_at: candidate.first_seen_at ?? candidate.ingested_at,
        last_seen_at: [candidate.last_seen_at, peer.last_seen_at, candidate.ingested_at, peer.ingested_at]
          .filter(Boolean)
          .sort()
          .at(-1),
        current_version: 1,
        current_status: "ACTIVE",
        source_count: 0,
        independent_source_count: 0,
        last_material_update_at: candidate.last_material_update_at ?? peer.last_material_update_at ?? null,
        latest_update_reason: "direct_postgres_partner_corroboration",
        latest_flash_id: candidate.flash_id,
        latest_content_hash: candidate.content_hash,
      })
      .select("family_id")
      .single();
    if (created.error || !created.data?.family_id) {
      throw new Error(`family create failed: ${created.error?.message ?? "missing id"}`);
    }
    familyId = created.data.family_id;

    const version = await db.from("live_flash_event_family_versions").insert({
      family_id: familyId,
      version: 1,
      captured_at: new Date().toISOString(),
      trigger_flash_id: candidate.flash_id,
      canonical_headline: candidate.headline,
      signal_category: candidate.signal_category,
      material_update_reason: "initial_event_family",
      content_hash: candidate.content_hash,
    });
    if (version.error) throw new Error(`family version failed: ${version.error.message}`);
  }

  for (const row of [candidate, peer]) {
    const member = await db.from("live_flash_event_family_members").upsert({
      family_id: familyId,
      flash_id: row.flash_id,
      linked_at: new Date().toISOString(),
      last_seen_at: row.last_seen_at ?? row.ingested_at ?? new Date().toISOString(),
    }, { onConflict: "family_id,flash_id" });
    if (member.error) throw new Error(`family member failed: ${member.error.message}`);

    const flash = await db.from("live_flash_events").update({
      event_family_id: familyId,
      updated_at: new Date().toISOString(),
    }).eq("flash_id", row.flash_id);
    if (flash.error) throw new Error(`flash family link failed: ${flash.error.message}`);

    const versionLink = await db.from("live_flash_event_versions").update({
      event_family_id: familyId,
    }).eq("flash_id", row.flash_id).eq("source_version", row.source_version);
    if (versionLink.error) throw new Error(`source version family link failed: ${versionLink.error.message}`);
  }

  const members = await db
    .from("live_flash_event_family_members")
    .select("flash_id")
    .eq("family_id", familyId)
    .limit(5000);
  if (members.error) throw new Error(`family members read failed: ${members.error.message}`);
  const memberIds = [...new Set((members.data ?? []).map((row) => row.flash_id))];

  const memberRows = [];
  for (let i = 0; i < memberIds.length; i += 250) {
    const result = await db
      .from("live_flash_events")
      .select("flash_id,source_id")
      .in("flash_id", memberIds.slice(i, i + 250));
    if (result.error) throw new Error(`family sources read failed: ${result.error.message}`);
    memberRows.push(...(result.data ?? []));
  }

  const sources = new Set(memberRows.map((row) => String(row.source_id ?? "")).filter(Boolean));
  const familyUpdate = await db.from("live_flash_event_families").update({
    source_count: memberIds.length,
    independent_source_count: sources.size,
    latest_flash_id: candidate.flash_id,
    latest_content_hash: candidate.content_hash,
    last_seen_at: [candidate.last_seen_at, peer.last_seen_at, candidate.ingested_at, peer.ingested_at]
      .filter(Boolean)
      .sort()
      .at(-1),
    updated_at: new Date().toISOString(),
  }).eq("family_id", familyId);
  if (familyUpdate.error) throw new Error(`family count update failed: ${familyUpdate.error.message}`);

  return familyId;
}

async function main() {
  const rows = await loadCountryRows();
  const candidates = rows.filter((row) => ["UNVERIFIED", "CORROBORATING"].includes(String(row.verification_status)));
  const statusById = new Map(rows.map((row) => [row.flash_id, row.verification_status]));
  const matchesById = new Map();

  let verified = 0;
  let corroborating = 0;
  let unverified = 0;
  let edgesWritten = 0;
  const diagnostics = [];

  for (const flash of candidates) {
    const primaryTime = eventTime(flash);
    const primaryFamily = String(flash.source_id ?? "");
    const edges = [];
    const corroboratingFamilies = new Set();
    let maxSimilarity = 0;
    let independentPeers = 0;
    let peerTimeRejections = 0;

    for (const other of rows) {
      if (other.flash_id === flash.flash_id) continue;
      const otherFamily = String(other.source_id ?? "");
      if (!otherFamily || otherFamily === primaryFamily) continue;
      if (flash.signal_category !== other.signal_category) continue;
      independentPeers += 1;

      const delta = deltaSeconds(flash, other);
      if (primaryTime === null || delta === null || delta > PEER_MAX_DELTA_SECONDS) {
        peerTimeRejections += 1;
        continue;
      }

      const score = similarity(flash.headline, other.headline);
      if (score < 0.34) continue;

      maxSimilarity = Math.max(maxSimilarity, score);
      corroboratingFamilies.add(otherFamily);
      edges.push({
        flash_id: flash.flash_id,
        corroboration_kind: "FLASH",
        corroborating_flash_id: other.flash_id,
        structured_event_id: null,
        corroborating_source_id: otherFamily,
        similarity: Number(score.toFixed(5)),
        country_overlap: true,
        time_delta_seconds: delta,
        relationship_method: "TOKEN_SIMILARITY_TIME_COUNTRY_V1",
      });
    }

    const reset = await db.from("live_flash_corroborations").delete().eq("flash_id", flash.flash_id);
    if (reset.error) throw new Error(`corroboration reset failed: ${reset.error.message}`);
    if (edges.length) {
      const inserted = await db.from("live_flash_corroborations").insert(edges);
      if (inserted.error) throw new Error(`corroboration insert failed: ${inserted.error.message}`);
      edgesWritten += edges.length;
    }

    const distinctSourceCount = 1 + corroboratingFamilies.size;
    const prior = Math.max(0, Math.min(10, Number(flash.source_reliability ?? 50) * 0.10));
    const verificationScore = Math.max(0, Math.min(100,
      prior +
      Math.min(40, corroboratingFamilies.size * FAMILY_SCORE) +
      maxSimilarity * SIMILARITY_SCORE_WEIGHT +
      (corroboratingFamilies.size ? COUNTRY_AGREEMENT_SCORE : 0)
    ));

    const strongMultiSourceMatch =
      distinctSourceCount >= MIN_INDEPENDENT_SOURCE_FAMILIES &&
      maxSimilarity >= MIN_SIMILARITY;

    let nextStatus = "UNVERIFIED";
    let reason = "No independent corroboration yet";
    if (corroboratingFamilies.size > 0 && strongMultiSourceMatch && verificationScore >= VERIFICATION_SCORE_THRESHOLD) {
      nextStatus = "VERIFIED";
      reason = "Matched at least two independent fast sources";
      verified += 1;
    } else if (corroboratingFamilies.size > 0 && verificationScore >= 35) {
      nextStatus = "CORROBORATING";
      reason = "Independent matching evidence found; verification threshold not yet met";
      corroborating += 1;
    } else {
      unverified += 1;
    }

    const updated = await db.from("live_flash_events").update({
      verification_status: nextStatus,
      verification_score: Number(verificationScore.toFixed(3)),
      corroboration_count: edges.length,
      independent_source_count: distinctSourceCount,
      verified_at: nextStatus === "VERIFIED" ? new Date().toISOString() : null,
      verification_reason: reason,
      updated_at: new Date().toISOString(),
    }).eq("flash_id", flash.flash_id);
    if (updated.error) throw new Error(`verification update failed: ${updated.error.message}`);

    statusById.set(flash.flash_id, nextStatus);
    matchesById.set(flash.flash_id, edges.map((edge) => ({
      peer_id: edge.corroborating_flash_id,
      similarity: edge.similarity,
    })));

    diagnostics.push({
      flash_id: flash.flash_id,
      source_id: flash.source_id,
      source_time: flash.published_at ?? flash.ingested_at,
      source_time_basis: flash.published_at ? "published_at" : "ingested_at",
      country_iso3: ISO3,
      independent_peers: independentPeers,
      peer_time_rejections: peerTimeRejections,
      corroborating_source_families: [...corroboratingFamilies].sort(),
      best_peer_similarity_in_time: Number(maxSimilarity.toFixed(5)),
      verification_score: Number(verificationScore.toFixed(3)),
      result: nextStatus,
      threshold_weakening: false,
    });
  }

  const rowById = new Map(rows.map((row) => [row.flash_id, row]));
  const familyPairs = new Set();
  for (const candidate of candidates) {
    if (statusById.get(candidate.flash_id) !== "VERIFIED") continue;
    const matches = (matchesById.get(candidate.flash_id) ?? [])
      .filter((match) => Number(match.similarity) >= MIN_SIMILARITY)
      .sort((a, b) => Number(b.similarity) - Number(a.similarity));

    for (const match of matches) {
      const peer = rowById.get(match.peer_id);
      if (!peer) continue;
      if (statusById.get(peer.flash_id) !== "VERIFIED" && peer.verification_status !== "VERIFIED") continue;
      if (peer.source_id === candidate.source_id || peer.signal_category !== candidate.signal_category) continue;
      const key = [candidate.flash_id, peer.flash_id].sort().join("|");
      if (familyPairs.has(key)) break;
      await ensureFamily(candidate, peer);
      familyPairs.add(key);
      break;
    }
  }

  const verifiedRows = await loadCountryRows();
  const finalVerified = verifiedRows.filter((row) => row.verification_status === "VERIFIED");
  const familyIds = new Set(finalVerified.map((row) => row.event_family_id).filter(Boolean));
  const sourceIds = new Set(finalVerified.map((row) => row.source_id).filter(Boolean));

  const output = {
    ok: true,
    schema_version: "geomacro.local-flash-corroboration.v1",
    country_iso3: ISO3,
    processed: candidates.length,
    verified,
    corroborating,
    unverified,
    reference_verified: rows.filter((row) => row.verification_status === "VERIFIED").length,
    edges_written: edgesWritten,
    verified_rows_after: finalVerified.length,
    verified_source_families_after: [...sourceIds].sort(),
    active_family_ids_after: [...familyIds].sort(),
    policy: {
      min_independent_source_families: MIN_INDEPENDENT_SOURCE_FAMILIES,
      min_similarity: MIN_SIMILARITY,
      verification_score_threshold: VERIFICATION_SCORE_THRESHOLD,
      peer_max_delta_seconds: PEER_MAX_DELTA_SECONDS,
      threshold_weakening: false,
      structured_event_shortcut_used: false,
    },
    diagnostics,
  };

  console.log(JSON.stringify(output));
  if (finalVerified.length < 1) process.exitCode = 3;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
