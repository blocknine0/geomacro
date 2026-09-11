import { defineEventHandler, getQuery, setResponseHeaders } from "h3";

import { renderTestnetSocialCardSvg } from "../../../src/lib/testnet-social-card";

export default defineEventHandler((event) => {
  const query = getQuery(event);

  const svg = renderTestnetSocialCardSvg({
    subject: String(query.subject ?? "Geomacro Risk Intelligence"),
    summary: String(
      query.summary ??
        "Explainable geopolitical and macro risk intelligence for testing.",
    ),
    score: query.score === undefined ? null : Number(query.score),
    delta: query.delta === undefined ? null : Number(query.delta),
    confidence: query.confidence === undefined ? null : Number(query.confidence),
    chain: query.chain === undefined ? null : String(query.chain),
    profile_name: query.profile_name === undefined ? null : String(query.profile_name),
  });

  setResponseHeaders(event, {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": "public, max-age=300, s-maxage=300",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
    "X-Robots-Tag": "noindex, nofollow",
  });

  return svg;
});