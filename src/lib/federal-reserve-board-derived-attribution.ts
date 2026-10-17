/**
 * Fixed, publicly disclosable Board credit for exactly one original issuer
 * publication. This is an attribution FORMAT prerequisite, NOT article-level
 * licence admission, independent same-event review, signed bytes or payment.
 *
 * No private original URL, article text, issuer registry ID, evidence hash,
 * logos, seals, images, linked PDF or third-party content may be serialized.
 * The independently approved rights/reviewer pipeline must still authorize
 * any commercial use before this credit can accompany paid intelligence.
 */
const FIXED={
  schema:"geomacro.approved-derived-article-attribution.v1",
  credit:"Board of Governors of the Federal Reserve System",
  material:"October 13, 2026 Board discount-rate meeting-minutes release",
  use_scope:"Board-authored original release text only; no third-party content, seals or logos",
  modifications:"Geomacro independently summarized the earlier discount-window minutes publication; no new rate decision or market reaction is asserted",
  endorsement:"No Federal Reserve Board endorsement of Geomacro is implied",
} as const;

export type FederalReserveBoardDerivedAttribution=Readonly<typeof FIXED>;

export function approvedFedBoardMinutesAttribution():FederalReserveBoardDerivedAttribution{
  return {...FIXED};
}

export function isApprovedFedBoardMinutesAttribution(value:unknown):
  value is FederalReserveBoardDerivedAttribution{
  if(!value||typeof value!=="object"||Array.isArray(value))return false;
  const x=value as Record<string,unknown>;
  const keys=Object.keys(FIXED).sort();
  if(Object.keys(x).sort().join("|")!==keys.join("|"))return false;
  return Object.entries(FIXED).every(([key,expected])=>x[key]===expected);
}
