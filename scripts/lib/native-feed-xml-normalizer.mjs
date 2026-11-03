/**
 * Bounded, in-memory RSS/Atom/RDF XML text repair for publisher-native discovery.
 * Input MUST come from a pinned HTTPS publisher source. This does not fetch,
 * persist source expression, infer rights or infer a publication timestamp.
 *
 * Only repairs encoding artifacts (BOM, illegal XML control bytes, bare ampersands).
 * No DTD, external entity, opaque HTML, article body or feed-level <updated>
 * can be upgraded to a verified item timestamp.
 */
export function normalizeNativeFeedXml(raw,maxBytes=192*1024){
 if(typeof raw!=="string"||
    !Number.isSafeInteger(maxBytes)||maxBytes<1024||maxBytes>1024*1024||
    new TextEncoder().encode(raw).byteLength>maxBytes||
    /<!DOCTYPE\b|<!ENTITY\b/iu.test(raw))return null;
 const clean=raw.replace(/^\uFEFF/u,"")
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/gu,"");
 const body=clean.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d{1,7}|#x[0-9a-f]{1,6});)/giu,
   "&amp;");
 if(!/^(?:<\?xml\b[^>]*\?>\s*)?<(?:rss|feed|rdf:RDF)\b/iu.test(body.trimStart())||
    new TextEncoder().encode(body).byteLength>maxBytes)return null;
 return body;
}
/** The dc:date path is allowed ONLY for a real RDF root declaring the
 * standard Dublin Core namespace, and always refers to the enclosing item.
 * It must not be synthesized from feed updated, lastBuildDate or fetch clock.
 */
export function verifiedRdfItemClock(document,item){
 if(typeof document!=="string"||typeof item!=="string"||
    !/<rdf:RDF\b/iu.test(document.slice(0,800))||
    !/xmlns:dc=["']http:\/\/purl\.org\/dc\/elements\/1\.1\/["']/iu.test(document.slice(0,1200)))
   return null;
 return item.match(/<dc:date(?:\s[^>]*)?>([^<>]{1,85})<\/dc:date>/iu)?.[1]?.trim()??null;
}
