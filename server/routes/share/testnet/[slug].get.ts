import { createError, defineEventHandler, getRouterParam, setResponseHeaders } from "h3";

import { loadPublicTestnetSharePage } from "../../../../src/lib/testnet-share.server";

function esc(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function shareHref(platform: string, shareUrl: string, text: string) {
  const u = encodeURIComponent(shareUrl);
  const t = encodeURIComponent(text);
  if (platform === "x") return `https://x.com/intent/post?text=${t}&url=${u}`;
  if (platform === "linkedin") return `https://www.linkedin.com/sharing/share-offsite/?url=${u}`;
  if (platform === "reddit") return `https://www.reddit.com/submit?url=${u}&title=${t}`;
  if (platform === "whatsapp") return `https://wa.me/?text=${encodeURIComponent(`${text} ${shareUrl}`)}`;
  if (platform === "telegram") return `https://t.me/share/url?url=${u}&text=${t}`;
  return shareUrl;
}

export default defineEventHandler(async (event) => {
  const slug = String(getRouterParam(event, "slug") ?? "");
  const page = await loadPublicTestnetSharePage(slug);
  if (!page) throw createError({ statusCode: 404, statusMessage: "SHARE_NOT_FOUND" });

  const site = String(process.env.PUBLIC_SITE_URL ?? "https://geomacro.live").replace(/\/$/, "");
  const shareUrl = `${site}/share/testnet/${page.share_slug}`;
  const cardUrl = `${site}/api/testnet-tester/share-card/${page.share_slug}`;
  const title = `${page.subject} | Geomacro Testnet`;
  const shareText = `Geomacro Signal: ${page.subject}`;
  const score = page.risk_score == null ? "N/A" : Math.round(Number(page.risk_score)).toString();
  const delta = page.risk_delta == null ? "—" : `${Number(page.risk_delta) >= 0 ? "+" : ""}${Number(page.risk_delta).toFixed(1)}`;
  const confidence = page.confidence == null ? "N/A" : `${Math.round(Number(page.confidence))}%`;

  setResponseHeaders(event, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "public, max-age=60, s-maxage=300",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  });

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(page.summary)}" />
  <link rel="canonical" href="${esc(shareUrl)}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(page.summary)}" />
  <meta property="og:url" content="${esc(shareUrl)}" />
  <meta property="og:image" content="${esc(cardUrl)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(page.summary)}" />
  <meta name="twitter:image" content="${esc(cardUrl)}" />
  <style>
    :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#080b12;color:#f5f8fc;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:980px;margin:0 auto;padding:40px 20px 64px}.brand{font-weight:800;letter-spacing:-.02em}.badge{display:inline-block;margin-left:10px;padding:5px 9px;border:1px solid #334766;border-radius:999px;color:#c7d7ef;font-size:11px;letter-spacing:.08em}.card{margin-top:30px;border:1px solid #263248;background:#0c111c;border-radius:24px;overflow:hidden}.card img{display:block;width:100%;height:auto}.body{padding:24px}.meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:20px}.metric{background:#111827;border:1px solid #25324a;border-radius:14px;padding:14px}.metric span{display:block;color:#8495ae;font-size:11px;margin-bottom:6px}.metric strong{font-size:24px}.share{display:flex;gap:10px;flex-wrap:wrap;margin-top:24px}.share a,.copy{appearance:none;border:1px solid #334766;background:#111c2d;color:#eef4ff;border-radius:10px;padding:10px 14px;text-decoration:none;font:inherit;cursor:pointer}.note{margin-top:22px;color:#8495ae;font-size:13px;line-height:1.6}@media(max-width:640px){.meta{grid-template-columns:1fr}.wrap{padding-top:24px}}
  </style>
</head>
<body>
  <main class="wrap">
    <div><span class="brand">Geomacro</span><span class="badge">TESTNET</span></div>
    <section class="card">
      <img src="${esc(cardUrl)}" width="1200" height="630" alt="Geomacro Testnet intelligence card" />
      <div class="body">
        <h1>${esc(page.subject)}</h1>
        <p>${esc(page.summary)}</p>
        <div class="meta">
          <div class="metric"><span>RISK SCORE</span><strong>${esc(score)}</strong></div>
          <div class="metric"><span>CHANGE</span><strong>${esc(delta)}</strong></div>
          <div class="metric"><span>CONFIDENCE</span><strong>${esc(confidence)}</strong></div>
        </div>
        <div class="share">
          <a href="${esc(shareHref("x", shareUrl, shareText))}" target="_blank" rel="noopener noreferrer">X</a>
          <a href="${esc(shareHref("linkedin", shareUrl, shareText))}" target="_blank" rel="noopener noreferrer">LinkedIn</a>
          <a href="${esc(shareHref("reddit", shareUrl, shareText))}" target="_blank" rel="noopener noreferrer">Reddit</a>
          <a href="${esc(shareHref("whatsapp", shareUrl, shareText))}" target="_blank" rel="noopener noreferrer">WhatsApp</a>
          <a href="${esc(shareHref("telegram", shareUrl, shareText))}" target="_blank" rel="noopener noreferrer">Telegram</a>
          <button class="copy" type="button" onclick="navigator.clipboard&&navigator.clipboard.writeText(location.href)">Copy link</button>
        </div>
        <div class="note">Testing/demo output only. This public page contains bounded Geomacro result fields and never exposes upstream news publisher identities, OAuth tokens, wallet secrets, API keys or private warehouse data.</div>
      </div>
    </section>
  </main>
</body>
</html>`;
});
