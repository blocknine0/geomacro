/** Only these published site destinations may appear in product answers. */
export const GEOMACRO_PUBLIC_LINKS = {
  about: {label:"About & Trust",to:"/about"},
  intelligence: {label:"Read intelligence",to:"/intelligence"},
  risk_indices: {label:"Risk Indices",to:"/risk-indices"},
  data_api: {label:"API & Agents",to:"/data-api"},
  pricing: {label:"Products & pricing",to:"/pricing"},
  docs: {label:"Documentation",to:"/docs"},
  research: {label:"Research & evidence",to:"/research"},
  contact: {label:"Contact Geomacro",to:"/contact"},
  roadmap: {label:"Public roadmap",to:"/roadmap"},
} as const;
export type GeomacroPublicLink = keyof typeof GEOMACRO_PUBLIC_LINKS;
