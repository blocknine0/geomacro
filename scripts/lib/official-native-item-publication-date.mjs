/**
 * Strictly unwrap one full XML CDATA section for an ORIGINAL RSS/Atom
 * per-entry publication field. This never reads channel build time or Atom
 * <updated>, never invents a missing publisher clock, and never parses HTML.
 */
export function officialItemNativePublicationMs(raw) {
  if(typeof raw!=="string"||raw.length>256)return NaN;
  let value=raw.trim();
  if(value.startsWith("<![CDATA[")){
    const section=/^<!\[CDATA\[([\s\S]{1,180})\]\]>$/u.exec(value);
    if(!section)return NaN;
    value=section[1].trim();
  }
  if(!value || value.length>180 || /[<>]|\p{Cc}|&(?:#|[A-Za-z])/u.test(value))
    return NaN;
  // Keep the established engine parser and source-original chronology gates.
  // Do not convert ambiguous dates or add guessed time zones.
  return Date.parse(value);
}
