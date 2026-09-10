import {
  defineEventHandler,
  getRouterParam,
  setResponseHeaders,
  setResponseStatus,
} from "h3";

import { loadPublishedCommercialProof } from "../../../../src/lib/commercial-ops.server";

function esc(value: unknown) {
  return String(value ?? "").replace(/[&<>\"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char] ?? char);
}

function table(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return '<div class="empty">No activity recorded for this section.</div>';
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const head = keys.map((key) => `<th>${esc(key)}</th>`).join("");
  const body = rows.map((row) => `<tr>${keys.map((key) => `<td>${esc(typeof row[key] === "object" ? JSON.stringify(row[key]) : row[key])}</td>`).join("")}</tr>`).join("");
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

export default defineEventHandler(async (event) => {
  const slug = String(getRouterParam(event, "slug") ?? "").trim();
  if (!/^[a-z0-9][a-z0-9-]{7,95}$/.test(slug)) {
    setResponseStatus(event, 404);
    return "Not found";
  }

  const proof = await loadPublishedCommercialProof(slug).catch(() => null);
  if (!proof || !proof.integrity.payload_sha256_valid) {
    setResponseStatus(event, 404);
    return "Not found";
  }

  const payload = proof.payload as {
    generated_at?: string;
    environments?: string[];
    usage?: Array<Record<string, unknown>>;
    payments?: Array<Record<string, unknown>>;
    proof_boundaries?: Record<string, unknown>;
  };
  const usage = Array.isArray(payload.usage) ? payload.usage : [];
  const payments = Array.isArray(payload.payments) ? payload.payments : [];
  const requestCount = usage.reduce((sum, row) => sum + Number(row.request_count ?? 0), 0);
  const successCount = usage.reduce((sum, row) => sum + Number(row.success_count ?? 0), 0);
  const paymentCount = payments.reduce((sum, row) => sum + Number(row.payment_count ?? 0), 0);
  const commercialRevenuePayments = payments.reduce((sum, row) => sum + Number(row.commercial_revenue_payment_count ?? 0), 0);
  const environments = Array.isArray(payload.environments) ? payload.environments.join(", ") : "";

  setResponseHeaders(event, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "public, max-age=60, s-maxage=300",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'self'",
  });

  const title = esc(proof.title);
  const description = esc(proof.description ?? "Redacted Geomacro product usage and payment evidence.");
  const shareText = encodeURIComponent(`${proof.title} · verified Geomacro activity proof`);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${title} · Geomacro</title>
<meta name="description" content="${description}" />
<meta property="og:title" content="${title} · Geomacro" />
<meta property="og:description" content="${description}" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary_large_image" />
<style>
:root{color-scheme:dark;background:#07090d;color:#f4f6f8;font-family:Inter,ui-sans-serif,system-ui,sans-serif}*{box-sizing:border-box}body{margin:0;background:#07090d}main{max-width:1280px;margin:0 auto;padding:34px 20px 72px}.eyebrow{font:12px ui-monospace,monospace;letter-spacing:.14em;color:#8da1b9}h1{font-size:34px;margin:8px 0 8px}.muted{color:#91a0b1;font-size:13px;line-height:1.55}.panel,.card{border:1px solid #222a37;background:#0d1118;border-radius:14px}.panel{padding:18px;margin-top:18px}.grid{display:grid;grid-template-columns:repeat(4,minmax(130px,1fr));gap:10px;margin-top:18px}.card{padding:14px}.k{font-size:11px;color:#8f9baa}.v{font-size:24px;font-weight:650;margin-top:7px}.badge{display:inline-block;border:1px solid #344054;border-radius:999px;padding:4px 8px;font:10px ui-monospace,monospace}.share{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}.share button{cursor:pointer;border:1px solid #303949;background:#111722;color:#eef2f6;border-radius:9px;padding:9px 11px;font:12px inherit}.table-wrap{overflow:auto;max-height:500px;margin-top:12px;border:1px solid #202734;border-radius:10px}table{border-collapse:collapse;width:100%;font-size:11px;white-space:nowrap}th,td{text-align:left;padding:8px 9px;border-bottom:1px solid #1c2430;border-right:1px solid #151c25}th{position:sticky;top:0;background:#111722;color:#aab5c2}.empty{color:#8f9baa;padding:12px}.hash{word-break:break-all;font:11px ui-monospace,monospace;color:#aab5c2}@media(max-width:850px){.grid{grid-template-columns:repeat(2,minmax(130px,1fr))}}
</style>
</head>
<body>
<main>
  <div class="eyebrow">GEOMACRO · REDACTED ACTIVITY PROOF</div>
  <h1>${title}</h1>
  <div class="muted">${description}</div>
  <div style="margin-top:12px"><span class="badge">${esc(proof.proof_version)}</span> <span class="badge">integrity verified</span></div>

  <div class="grid">
    <div class="card"><div class="k">Requests</div><div class="v">${requestCount}</div></div>
    <div class="card"><div class="k">Successful</div><div class="v">${successCount}</div></div>
    <div class="card"><div class="k">Payment events</div><div class="v">${paymentCount}</div></div>
    <div class="card"><div class="k">Revenue-classified payments</div><div class="v">${commercialRevenuePayments}</div></div>
  </div>

  <div class="panel">
    <div class="k">Proof window</div><div style="margin-top:6px">${esc(proof.period_started_at)} → ${esc(proof.period_ends_at)}</div>
    <div class="k" style="margin-top:12px">Environment scope</div><div style="margin-top:6px">${esc(environments)}</div>
    <div class="k" style="margin-top:12px">Snapshot SHA-256</div><div class="hash" style="margin-top:6px">${esc(proof.payload_sha256)}</div>
    <div class="muted" style="margin-top:12px">Testnet is always non-revenue. Mainnet or fiat activity is counted as commercial revenue only when explicitly classified as such. Customer identities, raw requests, credentials and upstream news-source identities are excluded from this public proof.</div>
    <div class="share">
      <button data-share="x">Share on X</button><button data-share="linkedin">LinkedIn</button><button data-share="reddit">Reddit</button><button data-share="whatsapp">WhatsApp</button><button data-share="telegram">Telegram</button><button data-share="copy">Copy link</button>
    </div>
  </div>

  <div class="panel"><h2>Usage proof</h2>${table(usage)}</div>
  <div class="panel"><h2>Payment proof</h2>${table(payments)}</div>
</main>
<script>
const pageUrl=location.href;
const shareText='${shareText}';
document.querySelectorAll('[data-share]').forEach(button=>button.addEventListener('click',async()=>{
 const kind=button.dataset.share, u=encodeURIComponent(pageUrl), text=shareText;
 const targets={
  x:'https://twitter.com/intent/tweet?text='+text+'&url='+u,
  linkedin:'https://www.linkedin.com/sharing/share-offsite/?url='+u,
  reddit:'https://www.reddit.com/submit?url='+u+'&title='+text,
  whatsapp:'https://wa.me/?text='+text+'%20'+u,
  telegram:'https://t.me/share/url?url='+u+'&text='+text
 };
 if(kind==='copy'){await navigator.clipboard.writeText(pageUrl);button.textContent='Copied';setTimeout(()=>button.textContent='Copy link',1200);return}
 window.open(targets[kind],'_blank','noopener,noreferrer');
}));
</script>
</body>
</html>`;
});
