import { createError, defineEventHandler, getRouterParam, setResponseHeaders } from "h3";

import { loadPublicTestnetSharePage } from "../../../../src/lib/testnet-share.server";
import { renderTestnetSocialCardSvg } from "../../../../src/lib/testnet-social-card";

export default defineEventHandler(async (event) => {
  const slug = String(getRouterParam(event, "slug") ?? "");
  const page = await loadPublicTestnetSharePage(slug);
  if (!page) throw createError({ statusCode: 404, statusMessage: "SHARE_NOT_FOUND" });

  const svg = renderTestnetSocialCardSvg({
    subject: page.subject,
    summary: page.summary,
    score: page.risk_score == null ? null : Number(page.risk_score),
    delta: page.risk_delta == null ? null : Number(page.risk_delta),
    confidence: page.confidence == null ? null : Number(page.confidence),
    chain: page.chain_label,
    profile_name: page.profile_name,
  });

  setResponseHeaders(event, {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": "public, max-age=300, s-maxage=300",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
  });
  return svg;
});
