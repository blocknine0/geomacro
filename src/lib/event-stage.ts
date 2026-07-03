/**
 * Single source of truth for Geomacro pipeline event stages.
 *
 * Every type, Zod schema, Supabase row mapper, AI prompt, and UI
 * component that touches a `stage` value MUST import from this file.
 *
 * `normalizeEventStage` is defensive: any legacy ("Emerging",
 * "Resolved"), null, or otherwise-unknown value collapses to
 * "Monitoring" instead of throwing. This keeps the Arena page from
 * crashing when upstream (Groq, manual inserts, older rows) emits
 * stages outside the canonical list.
 */
export const EVENT_STAGES = [
  "Monitoring",
  "Building",
  "Active Escalation",
  "Fragile Ceasefire",
  "De-escalation",
  "Stable",
] as const;

export type EventStage = (typeof EVENT_STAGES)[number];

const STAGE_SET: ReadonlySet<string> = new Set(EVENT_STAGES);

const LEGACY_MAP: Record<string, EventStage> = {
  emerging: "Monitoring",
  resolved: "Stable",
  // common casing / spelling drifts seen in upstream data
  escalation: "Active Escalation",
  "active-escalation": "Active Escalation",
  ceasefire: "Fragile Ceasefire",
  "fragile-ceasefire": "Fragile Ceasefire",
  deescalation: "De-escalation",
  "de escalation": "De-escalation",
  monitor: "Monitoring",
  stable: "Stable",
  building: "Building",
  unknown: "Monitoring",
};

export function normalizeEventStage(value: unknown): EventStage {
  if (typeof value !== "string") return "Monitoring";
  const trimmed = value.trim();
  if (!trimmed) return "Monitoring";
  if (STAGE_SET.has(trimmed)) return trimmed as EventStage;
  const key = trimmed.toLowerCase();
  if (LEGACY_MAP[key]) return LEGACY_MAP[key];
  // last-chance case-insensitive match against the canonical list
  for (const s of EVENT_STAGES) {
    if (s.toLowerCase() === key) return s;
  }
  return "Monitoring";
}