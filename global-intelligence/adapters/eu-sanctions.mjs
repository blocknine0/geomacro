import { createHash } from "node:crypto";

export const EU_SANCTIONS_URL = "https://webgate.ec.europa.eu/fsd/fsf";

function decodeXml(value) {
  return String(value ?? "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .trim();
}

function first(...values) {
  return values.find((v) => v != null && String(v).trim()) ?? null;
}

export function parseEuSanctionsXml(xml, { retrievedAt = new Date().toISOString() } = {}) {
  const records = [];
  const input = String(xml);
  const blocks = input.match(/<(?:sanctionEntity|entity|designation|record)\\b[^>]*>[\\s\\S]*?<\\/(?:sanctionEntity|entity|designation|record)>/gi) ?? [];

  for (const block of blocks) {
    const id = first(
      block.match(/<(?:euReferenceNumber|referenceNumber|id|logicalId)\\b[^>]*>([\\s\\S]*?)<\\/(?:euReferenceNumber|referenceNumber|id|logicalId)>/i)?.[1]
    );
    const name = first(
      block.match(/<(?:nameAlias|wholeName|name)\\b[^>]*>([\\s\\S]*?)<\\/(?:nameAlias|wholeName|name)>/i)?.[1]
    );
    const regime = first(
      block.match(/<(?:regime|programme|subjectType)\\b[^>]*>([\\s\\S]*?)<\\/(?:regime|programme|subjectType)>/i)?.[1]
    );
    const designationDate = first(
      block.match(/<(?:designationDate|listedDate|date)\\b[^>]*>([\\s\\S]*?)<\\/(?:designationDate|listedDate|date)>/i)?.[1]
    );

    if (!id && !name) continue;

    const cleanId = decodeXml(id ?? name);
    const cleanName = decodeXml(name ?? cleanId);
    const cleanRegime = decodeXml(regime ?? "");
    const cleanDate = decodeXml(designationDate ?? "");
    const publishedAt = cleanDate && !Number.isNaN(Date.parse(cleanDate))
      ? new Date(cleanDate).toISOString()
      : null;
    const rawPayload = block;

    records.push({
      source_id: "eu_sanctions_consolidated",
      source_record_id: "EUFS:" + cleanId.replace(/\\s+/g, "_"),
      category: "GEOPOLITICS",
      observed_at: retrievedAt,
      published_at: publishedAt,
      title: "EU financial sanctions designation: " + cleanName,
      summary: cleanRegime
        ? "EU financial sanctions designation under " + cleanRegime + "."
        : "EU financial sanctions designation.",
      source_url: EU_SANCTIONS_URL,
      metric: "sanctions_designation",
      value_numeric: 1,
      value_text: "DESIGNATED",
      unit: "designation",
      event_type: "SANCTIONS_DESIGNATION",
      signal_type: "EXTERNAL_SANCTIONS",
      provenance: {
        provider: "European Commission / DG FISMA",
        dataset: "Consolidated List of Financial Sanctions",
        reference_number: cleanId,
        regime: cleanRegime
      },
      raw_payload: rawPayload,
      raw_hash: createHash("sha256").update(rawPayload).digest("hex")
    });
  }

  if (!records.length) throw new Error("EU sanctions XML parser found no designation records");
  return records;
}

export function normalizeEuSanctionsRecord({ id, name, regime, designationDate = null, retrievedAt = new Date().toISOString(), url = EU_SANCTIONS_URL, raw = null }) {
  const cleanId = decodeXml(id);
  const cleanName = decodeXml(name ?? cleanId);
  const cleanRegime = decodeXml(regime ?? "");
  const rawPayload = raw ?? JSON.stringify({ id: cleanId, name: cleanName, regime: cleanRegime, designationDate });
  const publishedAt = designationDate && !Number.isNaN(Date.parse(designationDate))
    ? new Date(designationDate).toISOString()
    : null;

  return {
    source_id: "eu_sanctions_consolidated",
    source_record_id: "EUFS:" + String(cleanId).replace(/\\s+/g, "_"),
    category: "GEOPOLITICS",
    observed_at: retrievedAt,
    published_at: publishedAt,
    title: "EU financial sanctions designation: " + cleanName,
    summary: cleanRegime ? "EU financial sanctions designation under " + cleanRegime + "." : "EU financial sanctions designation.",
    source_url: url,
    metric: "sanctions_designation",
    value_numeric: 1,
    value_text: "DESIGNATED",
    unit: "designation",
    event_type: "SANCTIONS_DESIGNATION",
    signal_type: "EXTERNAL_SANCTIONS",
    provenance: { provider: "European Commission / DG FISMA", dataset: "Consolidated List of Financial Sanctions", reference_number: cleanId, regime: cleanRegime },
    raw_payload: rawPayload,
    raw_hash: createHash("sha256").update(rawPayload).digest("hex")
  };
}
