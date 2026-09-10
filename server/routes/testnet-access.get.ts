import { defineEventHandler, setResponseHeaders } from "h3";

export default defineEventHandler((event) => {
  setResponseHeaders(event, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy": "default-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; script-src 'none'; base-uri 'self'; frame-ancestors 'none'",
  });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Geomacro Testnet Access</title>
<meta name="description" content="Test Geomacro risk intelligence with Testnet USDC, developer API keys and AI-agent integration." />
<style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#07090d;color:#f4f6f8}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 20% 0,#101b31 0,#07090d 34%)}main{max-width:1180px;margin:auto;padding:36px 22px 80px}.nav{display:flex;justify-content:space-between;align-items:center;margin-bottom:72px}.brand{font-size:20px;font-weight:750}.badge{font:12px ui-monospace,monospace;padding:7px 11px;border:1px solid #33425c;border-radius:999px;color:#b9c8dd}.hero{max-width:850px}.eyebrow{font:12px ui-monospace,monospace;letter-spacing:.12em;color:#91a8c8}.hero h1{font-size:52px;line-height:1.03;margin:15px 0 18px}.hero p{font-size:19px;line-height:1.65;color:#aab5c4;max-width:760px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:40px}.card,.panel{background:#0d121b;border:1px solid #202a3a;border-radius:18px;padding:20px}.card strong{display:block;font-size:19px;margin-bottom:8px}.card p,.muted{color:#93a1b4;line-height:1.55;font-size:14px}.panel{margin-top:22px}.steps{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:16px}.step{border:1px solid #273348;background:#101722;border-radius:14px;padding:14px;min-height:98px}.n{font:11px ui-monospace,monospace;color:#7c91ad}.step b{display:block;margin-top:9px;font-size:14px}.access{display:grid;grid-template-columns:1.2fr .8fr;gap:18px;margin-top:22px}.price{font-size:36px;font-weight:800;margin:5px 0}.cta{display:inline-block;margin-top:10px;padding:11px 16px;border-radius:11px;background:#eef4ff;color:#0a1020;font-weight:750;text-decoration:none}.notice{margin-top:14px;padding:12px 14px;border-radius:12px;background:#0a1018;border:1px solid #25324a;color:#91a0b5;font-size:13px;line-height:1.55}.preview{width:100%;border-radius:14px;border:1px solid #273247;background:#0a0e15}.chains{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.chains span{border:1px solid #2a364b;border-radius:999px;padding:6px 9px;font-size:12px;color:#aebbd0}@media(max-width:850px){.grid,.access{grid-template-columns:1fr}.steps{grid-template-columns:1fr 1fr}.hero h1{font-size:40px}}@media(max-width:520px){.steps{grid-template-columns:1fr}}
</style>
</head>
<body>
<main>
  <div class="nav"><div class="brand">Geomacro</div><div class="badge">TESTNET · USDC ACCESS</div></div>
  <section class="hero">
    <div class="eyebrow">GEOPOLITICAL + MACRO RISK INTELLIGENCE</div>
    <h1>Test Geomacro inside your own product or AI agent.</h1>
    <p>Register once, verify your accounts and wallet, pay with supported Testnet USDC, then use the same governed Geomacro intelligence through the website, developer API or agent integration.</p>
  </section>

  <section class="grid">
    <div class="card"><strong>250 test credits</strong><p>Bounded structural country and corridor intelligence, signed Risk Objects and Risk Gate test access for 30 days.</p></div>
    <div class="card"><strong>Developer API keys</strong><p>Create scoped test keys for your app, AI agent, automation or demo. Keys expire with the tester entitlement.</p></div>
    <div class="card"><strong>Shareable intelligence</strong><p>Turn eligible outputs into branded social cards for X, LinkedIn, Reddit, WhatsApp and Telegram without exposing upstream news sources.</p></div>
  </section>

  <section class="panel">
    <div class="eyebrow">REGISTRATION</div>
    <div class="steps">
      <div class="step"><span class="n">01</span><b>Verify email</b><div class="muted">Account identity</div></div>
      <div class="step"><span class="n">02</span><b>Connect wallet</b><div class="muted">Signature verification</div></div>
      <div class="step"><span class="n">03</span><b>Connect X</b><div class="muted">OAuth verification</div></div>
      <div class="step"><span class="n">04</span><b>Connect Discord</b><div class="muted">OAuth verification</div></div>
      <div class="step"><span class="n">05</span><b>Complete profile</b><div class="muted">Name + optional image</div></div>
    </div>
  </section>

  <section class="access">
    <div class="panel" style="margin-top:0">
      <div class="eyebrow">TESTER PASS</div>
      <div class="price">1.00 Testnet USDC</div>
      <div class="muted">250 credits · 30 days · testing/demo only · never classified as commercial revenue.</div>
      <div class="chains"><span>Arc Testnet</span><span>Ethereum Sepolia</span><span>Base Sepolia</span><span>Polygon Amoy</span><span>Arbitrum Sepolia</span><span>OP Sepolia</span><span>Avalanche Fuji</span><span>Unichain Sepolia</span><span>Linea Sepolia</span></div>
      <div class="notice">Activation is fail-closed. Registration must be complete and the server must verify the supported-chain USDC transfer to Geomacro's dedicated receiving wallet before access becomes active.</div>
    </div>
    <div class="panel" style="margin-top:0">
      <div class="eyebrow">SOCIAL CARD PREVIEW</div>
      <img class="preview" alt="Geomacro Testnet social card preview" src="/api/testnet-tester/card?subject=USA%20%3E%20CHN&summary=Directional%20risk%20context%20for%20a%20Testnet%20integration%20demo.&score=73&delta=-2.1&confidence=84&chain=Arc%20Testnet" />
      <div class="muted" style="margin-top:10px">Final shared cards are generated from eligible output only. Upstream news-source identities are never included.</div>
    </div>
  </section>
</main>
</body>
</html>`;
});
