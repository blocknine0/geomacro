/**
 * Tiny bounded publisher-HTML text tokenizer. Do not use a script-removal
 * regex: browser HTML accepts malformed closing tags such as </script x>.
 * It is deliberately not a DOM renderer or a security/HTML sanitizer.
 * Only text outside script/style/template blocks contributes to private
 * release-day matching. Nothing derived here is presented as verified GRO.
 */
export function visiblePublisherText(html: string): string {
  if (typeof html !== "string" || html.length > 384 * 1024) return "";
  const output: string[] = [];
  let hidden: "script" | "style" | "template" | null = null;
  const tokens = html.match(/<[^>]*>|[^<]+/gu) ?? [];
  for (const token of tokens) {
    if (!token.startsWith("<")) {
      if (hidden === null) output.push(token);
      continue;
    }
    const match = /^<\s*(\/)?\s*([a-z][a-z0-9:-]*)\b[^>]*>$/iu.exec(token);
    if (!match) continue;
    const tag = match[2].toLowerCase();
    if (match[1]) {
      if (hidden === tag) hidden = null;
    } else if (hidden === null && (tag === "script" || tag === "style" || tag === "template")) {
      hidden = tag;
    }
  }
  return output.join(" ")
    .replace(/&(?:nbsp|amp);|&#160;|&#x[a-f0-9]+;|&#[0-9]+;/giu,
      value => value.toLowerCase() === "&amp;" ? "&" : " ")
    .replace(/\s+/gu, " ").trim();
}
