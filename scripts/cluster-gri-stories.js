#!/usr/bin/env node

import dotenv from "dotenv";
import Groq from "groq-sdk";
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

dotenv.config();

const CLASSIFICATION_VERSION = "event-severity-v1.0.2";
const CLASSIFICATION_PROMPT_VERSION = "risk-desk-filter-v1.0.2";

const CLUSTERING_VERSION = "story-correlation-v1.0.0";
const CLUSTERING_PROMPT_VERSION = "story-match-title-v1.0.0";

const LOOKBACK_HOURS = 72;
const MATCH_THRESHOLD = 90;
const MAX_CLUSTER_CANDIDATES = 40;

const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-20b";
const CEREBRAS_MODEL = process.env.CEREBRAS_MODEL || "llama3.1-8b";

const supabaseUrl =
  process.env.SUPABASE_URL || process.env.APP_SUPABASE_URL;

const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.APP_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Supabase URL and service-role key are required");
}

if (!process.env.GROQ_API_KEY && !process.env.CEREBRAS_API_KEY) {
  throw new Error("GROQ_API_KEY or CEREBRAS_API_KEY is required");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

function sha256(value) {
  return createHash("sha256")
    .update(String(value), "utf8")
    .digest("hex");
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
  }

  const keys = Object.keys(value).sort();

  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
    .join(",")}}`;
}

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function storyMember(event) {
  return {
    title: cleanText(event.source_title),
    publishedAt: event.published_at || null,
    sourceDomain: event.source_domain || null,
  };
}

function canonicalClassification(row) {
  return (
    row.classification_version === CLASSIFICATION_VERSION &&
    row.classification_prompt_version === CLASSIFICATION_PROMPT_VERSION &&
    cleanText(row.classification_provider) !== "" &&
    cleanText(row.classification_model) !== "" &&
    cleanText(row.classification_scored_at) !== "" &&
    /^[0-9a-f]{64}$/.test(String(row.classification_input_hash || ""))
  );
}

async function fetchCanonicalEvents() {
  const cutoff = new Date(
    Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const rows = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("events")
      .select(
        [
          "id",
          "category",
          "source_title",
          "source_name",
          "source_domain",
          "source_url",
          "published_at",
          "created_at",
          "classification_provider",
          "classification_model",
          "classification_version",
          "classification_prompt_version",
          "classification_scored_at",
          "classification_input_hash",
        ].join(","),
      )
      .gte("created_at", cutoff)
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`events query failed: ${error.message}`);
    }

    rows.push(...(data || []));

    if ((data || []).length < pageSize) break;
  }

  const canonicalByEventId = new Map();

  for (const row of rows) {
    if (canonicalClassification(row)) {
      canonicalByEventId.set(row.id, row);
    }
  }

  const eventIds = rows.map((row) => row.id);

  for (let i = 0; i < eventIds.length; i += 200) {
    const ids = eventIds.slice(i, i + 200);
    if (!ids.length) continue;

    const { data, error } = await supabase
      .from("gri_event_assessments")
      .select(
        [
          "event_id",
          "category",
          "classification_provider",
          "classification_model",
          "classification_version",
          "classification_prompt_version",
          "classification_scored_at",
          "classification_input_hash",
        ].join(","),
      )
      .in("event_id", ids)
      .eq("classification_version", CLASSIFICATION_VERSION)
      .eq(
        "classification_prompt_version",
        CLASSIFICATION_PROMPT_VERSION,
      );

    if (error) {
      throw new Error(`reassessment query failed: ${error.message}`);
    }

    for (const assessment of data || []) {
      if (!canonicalClassification(assessment)) continue;

      const parent = rows.find(
        (row) => row.id === assessment.event_id,
      );

      if (!parent) continue;

      canonicalByEventId.set(parent.id, {
        ...parent,
        category: assessment.category,
        classification_provider:
          assessment.classification_provider,
        classification_model:
          assessment.classification_model,
        classification_version:
          assessment.classification_version,
        classification_prompt_version:
          assessment.classification_prompt_version,
        classification_scored_at:
          assessment.classification_scored_at,
        classification_input_hash:
          assessment.classification_input_hash,
      });
    }
  }

  return [...canonicalByEventId.values()].sort((a, b) => {
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();

    if (ta !== tb) return ta - tb;
    return String(a.id).localeCompare(String(b.id));
  });
}

async function fetchStoryLedger() {
  const { data: clusters, error: clusterError } = await supabase
    .from("gri_story_clusters")
    .select(
      "id,category,anchor_event_id,canonical_label,clustering_version,clustering_prompt_version,created_at",
    )
    .eq("clustering_version", CLUSTERING_VERSION)
    .eq(
      "clustering_prompt_version",
      CLUSTERING_PROMPT_VERSION,
    );

  if (clusterError) {
    throw new Error(
      `story cluster query failed: ${clusterError.message}`,
    );
  }

  const { data: assignments, error: assignmentError } =
    await supabase
      .from("gri_story_assignments")
      .select(
        "id,cluster_id,event_id,category,decision,match_confidence,decision_rationale,clustering_version,clustering_prompt_version",
      )
      .eq("clustering_version", CLUSTERING_VERSION)
      .eq(
        "clustering_prompt_version",
        CLUSTERING_PROMPT_VERSION,
      );

  if (assignmentError) {
    throw new Error(
      `story assignment query failed: ${assignmentError.message}`,
    );
  }

  return {
    clusters: clusters || [],
    assignments: assignments || [],
  };
}

function buildMatchPrompt(event, candidates) {
  const clusterBlock = candidates
    .map((cluster, index) => {
      const members = cluster.members
        .slice(0, 6)
        .map(
          (member) =>
            [
              `    - title: ${member.title}`,
              `      published_at: ${member.publishedAt || "unknown"}`,
              `      source_domain: ${member.sourceDomain || "unknown"}`,
            ].join("\n"),
        )
        .join("\n");

      return [
        `Cluster ${index}:`,
        `  label: ${cluster.canonicalLabel}`,
        `  members:`,
        members || "    - unavailable",
      ].join("\n");
    })
    .join("\n\n");

  return `Strict GRI story-correlation audit.

CATEGORY IS FIXED: ${event.category}

Decide whether the NEW ARTICLE reports the SAME SPECIFIC UNDERLYING REAL-WORLD DEVELOPMENT as exactly one existing cluster.

Rules:
- Same broad topic is NOT the same story.
- Same country, person, institution, war, market, or policy theme is NOT enough.
- Different speeches, attacks, decisions, sanctions, data releases, votes, meetings, or incidents are separate stories unless the titles clearly describe the same occurrence.
- Different publishers reporting the same specific speech, announcement, attack, policy decision, data release, or incident ARE the same story.
- Do not merge merely because articles have similar risk implications.
- Use only the supplied source-grounded titles, timestamps and domains.
- Do not infer missing facts.
- If uncertain, return sameStory=false.
- Never match across categories.

NEW ARTICLE:
title: ${event.source_title}
published_at: ${event.published_at || "unknown"}
source_domain: ${event.source_domain || "unknown"}

EXISTING CLUSTERS:
${clusterBlock}

Return JSON only:
{
  "sameStory": true,
  "clusterIndex": 0,
  "confidence": 95,
  "rationale": "Brief source-grounded reason"
}

If no existing cluster is clearly the same specific development:
{
  "sameStory": false,
  "clusterIndex": null,
  "confidence": 0,
  "rationale": "Brief reason this is distinct or uncertain"
}`;
}

async function callCerebras(prompt) {
  const response = await fetch(
    "https://api.cerebras.ai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.CEREBRAS_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: CEREBRAS_MODEL,
        temperature: 0,
        max_tokens: 500,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Cerebras ${response.status}: ${await response.text()}`,
    );
  }

  const data = await response.json();

  return {
    provider: "cerebras",
    model: CEREBRAS_MODEL,
    content: data.choices?.[0]?.message?.content,
  };
}

async function callMatcher(prompt) {
  let groqError = null;

  if (groq) {
    try {
      const payload = {
        model: GROQ_MODEL,
        temperature: 0,
        max_tokens: 500,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      };

      if (
        GROQ_MODEL.includes("gpt-oss") ||
        GROQ_MODEL.includes("o1") ||
        GROQ_MODEL.includes("o3")
      ) {
        payload.reasoning_effort = "low";
      }

      const completion =
        await groq.chat.completions.create(payload);

      return {
        provider: "groq",
        model: GROQ_MODEL,
        content:
          completion.choices?.[0]?.message?.content,
      };
    } catch (error) {
      groqError = error;

      if (!process.env.CEREBRAS_API_KEY) {
        throw error;
      }

      console.warn(
        `  ⚠️ Groq matcher failed (${error.message}); using Cerebras fallback.`,
      );
    }
  }

  if (process.env.CEREBRAS_API_KEY) {
    return await callCerebras(prompt);
  }

  throw groqError || new Error("No clustering provider available");
}

function parseMatch(content, candidateCount) {
  let parsed;

  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("story matcher returned invalid JSON");
  }

  const sameStory = parsed.sameStory === true;
  const confidence = Number(parsed.confidence);
  const rationale = cleanText(parsed.rationale);

  if (!Number.isFinite(confidence)) {
    throw new Error("story matcher returned invalid confidence");
  }

  if (!rationale) {
    throw new Error("story matcher returned no rationale");
  }

  if (!sameStory) {
    return {
      sameStory: false,
      clusterIndex: null,
      confidence: 0,
      rationale,
    };
  }

  if (
    !Number.isInteger(parsed.clusterIndex) ||
    parsed.clusterIndex < 0 ||
    parsed.clusterIndex >= candidateCount
  ) {
    throw new Error("story matcher returned invalid clusterIndex");
  }

  return {
    sameStory: true,
    clusterIndex: parsed.clusterIndex,
    confidence: Math.max(0, Math.min(100, confidence)),
    rationale,
  };
}

async function createCluster(event, metadata) {
  const scoredAt = new Date().toISOString();

  const { data, error } = await supabase.rpc(
    "create_gri_story_cluster_with_assignments",
    {
      p_category: event.category,
      p_anchor_event_id: event.id,
      p_canonical_label: cleanText(event.source_title).slice(
        0,
        240,
      ),
      p_clustering_provider: metadata.provider,
      p_clustering_model: metadata.model,
      p_clustering_version: CLUSTERING_VERSION,
      p_clustering_prompt_version:
        CLUSTERING_PROMPT_VERSION,
      p_clustering_scored_at: scoredAt,
      p_clustering_input_hash: metadata.inputHash,
      p_assignments: [
        {
          event_id: event.id,
          decision: "anchor",
          match_confidence: 100,
          decision_rationale: metadata.rationale,
        },
      ],
    },
  );

  if (error) {
    throw new Error(`create story cluster failed: ${error.message}`);
  }

  return data;
}

async function appendToCluster(
  cluster,
  event,
  match,
  providerResult,
  inputHash,
) {
  const { error } = await supabase.rpc(
    "assign_gri_event_to_story_cluster",
    {
      p_cluster_id: cluster.id,
      p_event_id: event.id,
      p_category: event.category,
      p_match_confidence: match.confidence,
      p_decision_rationale: match.rationale,
      p_clustering_provider: providerResult.provider,
      p_clustering_model: providerResult.model,
      p_clustering_version: CLUSTERING_VERSION,
      p_clustering_prompt_version:
        CLUSTERING_PROMPT_VERSION,
      p_clustering_scored_at: new Date().toISOString(),
      p_clustering_input_hash: inputHash,
    },
  );

  if (error) {
    throw new Error(
      `append story assignment failed: ${error.message}`,
    );
  }
}

async function main() {
  console.log("============================================================");
  console.log("GRI immutable story correlation");
  console.log(`Contract: ${CLUSTERING_VERSION}`);
  console.log(`Prompt:   ${CLUSTERING_PROMPT_VERSION}`);
  console.log(`Match threshold: ${MATCH_THRESHOLD}`);
  console.log("Title/source metadata only. No old model summaries.");
  console.log("============================================================");

  const canonicalEvents = await fetchCanonicalEvents();
  const ledger = await fetchStoryLedger();

  const eventById = new Map(
    canonicalEvents.map((event) => [event.id, event]),
  );

  const assignedByEventId = new Map(
    ledger.assignments.map((row) => [row.event_id, row]),
  );

  const clusters = new Map();

  for (const row of ledger.clusters) {
    clusters.set(row.id, {
      id: row.id,
      category: row.category,
      anchorEventId: row.anchor_event_id,
      canonicalLabel: row.canonical_label,
      memberEventIds: [],
      members: [],
    });
  }

  for (const assignment of ledger.assignments) {
    const cluster = clusters.get(assignment.cluster_id);
    const currentEvent = eventById.get(assignment.event_id);

    if (!cluster || !currentEvent) continue;

    cluster.memberEventIds.push(currentEvent.id);
    cluster.members.push(storyMember(currentEvent));
  }

  let alreadyAssigned = 0;
  let newClusters = 0;
  let matched = 0;

  for (const event of canonicalEvents) {
    if (assignedByEventId.has(event.id)) {
      alreadyAssigned++;
      continue;
    }

    let candidates = [...clusters.values()]
      .filter(
        (cluster) =>
          cluster.category === event.category &&
          cluster.members.length > 0,
      )
      .sort((a, b) => a.id.localeCompare(b.id));

    if (candidates.length > MAX_CLUSTER_CANDIDATES) {
      throw new Error(
        `story candidate overflow for ${event.category}: ` +
          `${candidates.length} exceeds fail-closed limit ${MAX_CLUSTER_CANDIDATES}`,
      );
    }

    if (candidates.length === 0) {
      const input = canonicalJson({
        category: event.category,
        eventId: event.id,
        sourceTitle: event.source_title,
        publishedAt: event.published_at,
        sourceDomain: event.source_domain,
        decision: "bootstrap-new-story",
      });

      const clusterId = await createCluster(event, {
        provider: "deterministic",
        model: "singleton-bootstrap-v1",
        inputHash: sha256(input),
        rationale:
          "No active same-category story cluster existed in the current 72-hour evidence window.",
      });

      clusters.set(clusterId, {
        id: clusterId,
        category: event.category,
        anchorEventId: event.id,
        canonicalLabel: event.source_title,
        memberEventIds: [event.id],
        members: [storyMember(event)],
      });

      assignedByEventId.set(event.id, {
        cluster_id: clusterId,
      });

      newClusters++;

      console.log(
        `  🆕 [${event.category}] new story: "${event.source_title}"`,
      );

      continue;
    }

    const prompt = buildMatchPrompt(event, candidates);
    const inputHash = sha256(prompt);
    const providerResult = await callMatcher(prompt);
    const match = parseMatch(
      providerResult.content,
      candidates.length,
    );

    if (
      match.sameStory &&
      match.confidence >= MATCH_THRESHOLD
    ) {
      const cluster = candidates[match.clusterIndex];

      await appendToCluster(
        cluster,
        event,
        match,
        providerResult,
        inputHash,
      );

      cluster.memberEventIds.push(event.id);
      cluster.members.push(storyMember(event));

      assignedByEventId.set(event.id, {
        cluster_id: cluster.id,
      });

      matched++;

      console.log(
        `  🔗 [${event.category}] ${match.confidence}% "${event.source_title}"`,
      );
      console.log(
        `     → ${cluster.canonicalLabel}`,
      );
      console.log(`     ${match.rationale}`);

      continue;
    }

    const rationale = match.sameStory
      ? `Potential match was below ${MATCH_THRESHOLD}% threshold (${match.confidence}%). ${match.rationale}`
      : match.rationale;

    const clusterId = await createCluster(event, {
      provider: providerResult.provider,
      model: providerResult.model,
      inputHash,
      rationale,
    });

    clusters.set(clusterId, {
      id: clusterId,
      category: event.category,
      anchorEventId: event.id,
      canonicalLabel: event.source_title,
      memberEventIds: [event.id],
      members: [storyMember(event)],
    });

    assignedByEventId.set(event.id, {
      cluster_id: clusterId,
    });

    newClusters++;

    console.log(
      `  🆕 [${event.category}] distinct story: "${event.source_title}"`,
    );
    console.log(`     ${rationale}`);
  }

  console.log("");
  console.log("GRI story correlation complete.");
  console.log(`Canonical events: ${canonicalEvents.length}`);
  console.log(`Already assigned: ${alreadyAssigned}`);
  console.log(`New clusters: ${newClusters}`);
  console.log(`Matched to existing clusters: ${matched}`);
}

main().catch((error) => {
  console.error(`❌ Story correlation failed: ${error.message}`);
  process.exit(1);
});
