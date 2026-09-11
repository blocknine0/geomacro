import { defineEventHandler, setResponseHeaders } from "h3";

export default defineEventHandler((event) => {
  setResponseHeaders(event, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy": "default-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; script-src 'self'; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self' https://x.com https://discord.com",
  });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Geomacro Testnet Access</title>
<meta name="description" content="Test Geomacro risk intelligence with Testnet USDC, developer API keys and AI-agent integration." />
<style>
:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#080d16;color:#f4f2ea;--line:rgba(255,255,255,.08);--card:rgba(255,255,255,.035);--amber:#ff9d19;--muted:#979fab}*{box-sizing:border-box}body{margin:0;background:radial-gradient(1100px 520px at 12% -10%,rgba(255,157,25,.10) 0,rgba(8,13,22,0) 60%),#080d16}main{max-width:1180px;margin:auto;padding:36px 22px 80px}.nav{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:72px}.brand img{display:block;height:40px;width:auto}.badge{font:12px ui-monospace,monospace;padding:7px 11px;border:1px solid var(--line);border-radius:999px;color:var(--muted);background:var(--card)}.hero{max-width:850px}.eyebrow{font:12px ui-monospace,monospace;letter-spacing:.12em;color:var(--amber)}.hero h1{font-size:52px;line-height:1.03;margin:15px 0 18px;letter-spacing:-.02em}.hero p{font-size:19px;line-height:1.65;color:var(--muted);max-width:760px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:40px}.card,.panel{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px}.card strong{display:block;font-size:19px;margin-bottom:8px}.card p,.muted{color:var(--muted);line-height:1.55;font-size:14px}.panel{margin-top:22px}.steps{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:16px}.step{border:1px solid var(--line);background:rgba(255,255,255,.02);border-radius:12px;padding:14px;min-height:98px}.n{font:11px ui-monospace,monospace;color:var(--amber)}.step b{display:block;margin-top:9px;font-size:14px}.access{display:grid;grid-template-columns:1.2fr .8fr;gap:18px;margin-top:22px}.price{font-size:36px;font-weight:800;margin:5px 0;color:var(--amber);letter-spacing:-.02em}.notice{margin-top:14px;padding:12px 14px;border-radius:12px;background:rgba(255,255,255,.02);border:1px solid var(--line);color:var(--muted);font-size:13px;line-height:1.55}.preview{width:100%;border-radius:14px;border:1px solid var(--line);background:#0a0f18}.faucets{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px}.faucet{border:1px solid var(--line);border-radius:12px;padding:12px;background:rgba(255,255,255,.02);display:flex;flex-direction:column;gap:9px}.faucet b{font-size:14px;font-weight:650}.faucet a{display:inline-block;text-align:center;text-decoration:none;font-size:13px;font-weight:700;border-radius:10px;padding:8px 10px;border:1px solid rgba(255,157,25,.35);background:rgba(255,157,25,.10);color:var(--amber)}.faucet a:hover{background:rgba(255,157,25,.18)}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}.field{display:flex;flex-direction:column;gap:6px}.field.full{grid-column:1/-1}label{font-size:12px;color:var(--muted)}input,select,button{width:100%;border:1px solid var(--line);background:rgba(255,255,255,.02);color:#f4f2ea;border-radius:10px;padding:11px 12px;font:14px inherit}button{cursor:pointer;font-weight:700;background:var(--amber);color:#0d1117;border-color:transparent}button:hover{filter:brightness(1.06)}button.secondary{background:rgba(255,255,255,.04);color:#f4f2ea;border:1px solid var(--line)}.status-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:14px}.status{border:1px solid var(--line);border-radius:12px;padding:12px;background:rgba(255,255,255,.02)}.status span{display:block;font-size:11px;color:var(--muted);margin-bottom:6px}.status strong{font-size:13px}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}.actions button{width:auto}.mono{font:12px ui-monospace,monospace;word-break:break-all;color:#e6e3da}.key-row{display:flex;justify-content:space-between;gap:12px;align-items:center;border-top:1px solid var(--line);padding:12px 0}.key-row:first-child{border-top:0}.key-row strong,.key-row span{display:block}.key-row span{font-size:12px;color:var(--muted);margin-top:4px}.key-row button{width:auto;background:rgba(255,255,255,.04);color:#f4f2ea;border:1px solid var(--line)}.okline{min-height:22px;margin-top:10px;color:var(--muted);font-size:13px}.profile-tools{display:grid;grid-template-columns:auto 1fr;gap:16px;align-items:center;margin-top:18px;padding-top:18px;border-top:1px solid var(--line)}.avatar{width:82px;height:82px;border-radius:16px;object-fit:cover;border:1px solid var(--line);background:#0a0f18}@media(max-width:850px){.grid,.access,.form-grid,.faucets{grid-template-columns:1fr}.field.full{grid-column:auto}.steps,.status-grid{grid-template-columns:1fr 1fr}.hero h1{font-size:40px}}@media(max-width:520px){.steps,.status-grid,.profile-tools{grid-template-columns:1fr}.avatar{width:72px;height:72px}}
</style>
<script src="/testnet-access.js" defer></script>
</head>
<body>
<main>
  <div class="nav"><div class="brand"><img src="/__l5e/assets-v1/9118c3e7-7750-4173-90cc-dd0445585e92/geomacro-logo.png" alt="Geomacro" height="40" /></div><div class="badge">TESTNET · USDC ACCESS</div></div>
  <section class="hero">
    <div class="eyebrow">GEOPOLITICAL + MACRO RISK INTELLIGENCE</div>
    <h1>Test Geomacro inside your own product or AI agent.</h1>
    <p>Register once, verify your email, wallet, X and Discord, activate one fixed 500-credit tester quota with 0.50 Testnet USDC, then use Geomacro through the website, developer API or agent integration.</p>
    <div id="globalStatus" class="okline"></div>
  </section>
  <section class="grid">
    <div class="card"><strong>500 fixed test credits</strong><p>One tester quota per verified email + wallet identity. Credits are for testing/demo use only and expire with the tester entitlement.</p></div>
    <div class="card"><strong>Developer API keys</strong><p>Create scoped test keys for your app, AI agent, automation or demo. Keys consume the same fixed 500-credit balance.</p></div>
    <div class="card"><strong>Share + feedback on X</strong><p>Test the product, then post your experience publicly on X. Geomacro-branded share cards remain available for eligible outputs.</p></div>
  </section>
  <section class="panel">
    <div class="eyebrow">REGISTRATION</div>
    <div class="steps">
      <div class="step"><span class="n">01</span><b>Verify email</b><div class="muted">Unique tester identity</div></div>
      <div class="step"><span class="n">02</span><b>Connect wallet</b><div class="muted">Unique wallet identity</div></div>
      <div class="step"><span class="n">03</span><b>Connect X</b><div class="muted">OAuth verification</div></div>
      <div class="step"><span class="n">04</span><b>Connect Discord</b><div class="muted">OAuth verification</div></div>
      <div class="step"><span class="n">05</span><b>Complete profile</b><div class="muted">Name + optional image</div></div>
    </div>
  </section>
  <section id="registrationPanel" class="panel">
    <div class="eyebrow">CREATE TESTER ACCOUNT</div>
    <form id="registrationForm" class="form-grid">
      <div class="field"><label for="profileNameInput">Profile name</label><input id="profileNameInput" maxlength="64" required autocomplete="name" /></div>
      <div class="field"><label for="emailInput">Email</label><input id="emailInput" type="email" maxlength="254" required autocomplete="email" /></div>
      <div class="field full"><button type="submit">Create tester account</button></div>
    </form>
    <div id="registrationStatus" class="okline"></div>
    <div class="notice">By registering you accept the current Testnet Tester terms. Never enter a seed phrase or private key. Geomacro only asks your wallet to sign a non-transaction verification message.</div>
  </section>
  <section id="accountPanel" class="panel" hidden>
    <div class="eyebrow">YOUR TESTER ACCOUNT</div>
    <h2 id="profileStatus">Tester</h2>
    <div class="status-grid">
      <div class="status"><span>Email</span><strong id="emailStatus">Pending</strong></div>
      <div class="status"><span>Wallet</span><strong id="walletStatus">Pending</strong></div>
      <div class="status"><span>X</span><strong id="xStatus">Pending</strong></div>
      <div class="status"><span>Discord</span><strong id="discordStatus">Pending</strong></div>
      <div class="status"><span>Access</span><strong id="accessStatus">awaiting_payment</strong></div>
    </div>
    <div class="actions">
      <button id="walletConnect" type="button" class="secondary">Connect & verify wallet</button>
      <button id="xConnect" type="button" class="secondary">Connect X</button>
      <button id="discordConnect" type="button" class="secondary">Connect Discord</button>
    </div>
    <div id="walletActionStatus" class="okline"></div>
    <div class="profile-tools">
      <img id="avatarPreview" class="avatar" alt="Tester profile image" hidden />
      <form id="avatarForm" class="form-grid" enctype="multipart/form-data">
        <div class="field full"><label for="avatarInput">Optional profile image · PNG, JPEG or WebP · max 2 MB</label><input id="avatarInput" type="file" accept="image/png,image/jpeg,image/webp" /></div>
        <div class="field full"><button type="submit" class="secondary">Upload profile image</button></div>
        <div id="avatarStatus" class="okline field full"></div>
      </form>
    </div>
  </section>
  <section id="paymentPanel" class="panel" hidden>
    <div class="eyebrow">ACTIVATE FIXED TESTER QUOTA</div>
    <div class="price">0.50 Testnet USDC</div>
    <div class="muted">500 credits · 30 days · one quota per verified email + wallet · testing/demo only · never classified as commercial revenue.</div>
    <div class="eyebrow" style="margin-top:16px">SUPPORTED PAYMENT CHAINS · GET TESTNET USDC</div>
    <div class="faucets">
      <div class="faucet"><b>Arc Testnet</b><a href="https://faucet.circle.com/" target="_blank" rel="noopener noreferrer">Get Testnet USDC</a></div>
      <div class="faucet"><b>Ethereum Sepolia</b><a href="https://faucet.circle.com/" target="_blank" rel="noopener noreferrer">Get Testnet USDC</a></div>
      <div class="faucet"><b>Base Sepolia</b><a href="https://faucet.circle.com/" target="_blank" rel="noopener noreferrer">Get Testnet USDC</a></div>
      <div class="faucet"><b>Polygon Amoy</b><a href="https://faucet.circle.com/" target="_blank" rel="noopener noreferrer">Get Testnet USDC</a></div>
      <div class="faucet"><b>Arbitrum Sepolia</b><a href="https://faucet.circle.com/" target="_blank" rel="noopener noreferrer">Get Testnet USDC</a></div>
      <div class="faucet"><b>OP Sepolia</b><a href="https://faucet.circle.com/" target="_blank" rel="noopener noreferrer">Get Testnet USDC</a></div>
      <div class="faucet"><b>Avalanche Fuji</b><a href="https://faucet.circle.com/" target="_blank" rel="noopener noreferrer">Get Testnet USDC</a></div>
      <div class="faucet"><b>Unichain Sepolia</b><a href="https://faucet.circle.com/" target="_blank" rel="noopener noreferrer">Get Testnet USDC</a></div>
      <div class="faucet"><b>Linea Sepolia</b><a href="https://faucet.circle.com/" target="_blank" rel="noopener noreferrer">Get Testnet USDC</a></div>
    </div>
    <div class="notice">Testnet USDC comes from the official Circle faucet at faucet.circle.com. You may also need a small amount of the network's native gas token from that network's own public faucet before the transfer will confirm.</div>
    <div class="notice"><b>Dedicated Geomacro Testnet fee receiver</b><div id="receiverAddress" class="mono" style="margin-top:7px">Configuration pending</div><div class="actions"><button id="copyReceiver" type="button" class="secondary">Copy receiver</button></div></div>
    <form id="paymentForm" class="form-grid">
      <div class="field"><label for="chainSelect">Payment chain</label><select id="chainSelect"></select></div>
      <div class="field"><label for="txHashInput">USDC transfer transaction hash</label><input id="txHashInput" placeholder="0x..." maxlength="66" required /></div>
      <div class="field full"><button type="submit">Verify payment & activate 500 credits</button></div>
    </form>
    <div id="paymentStatus" class="okline"></div>
    <div class="notice">Activation is fail-closed. The server verifies chain ID, configured Testnet USDC contract, verified payer wallet, dedicated receiver, amount and receipt status. The same email or wallet cannot receive a second tester quota.</div>
  </section>
  <section id="developerPanel" class="panel" hidden>
    <div class="eyebrow">DEVELOPER + AGENT ACCESS</div>
    <h2>Use Geomacro in your product or AI agent</h2>
    <p class="muted">Create up to three scoped Testnet API keys. Each key expires with your tester entitlement and consumes the same fixed 500-credit balance.</p>
    <form id="developerKeyForm" class="form-grid">
      <div class="field"><label for="keyLabelInput">Key label</label><input id="keyLabelInput" maxlength="80" placeholder="My agent test" /></div>
      <div class="field"><label for="integrationTypeSelect">Integration</label><select id="integrationTypeSelect"><option value="product_api">Product API</option><option value="ai_agent">AI agent</option><option value="automation">Automation</option><option value="demo">Demo</option></select></div>
      <div class="field full"><button type="submit">Create Testnet API key</button></div>
    </form>
    <div id="developerStatus" class="okline"></div>
    <div id="issuedKeyBox" class="notice" hidden><b>Shown once</b><div id="issuedKey" class="mono" style="margin-top:7px"></div><div class="actions"><button id="copyIssuedKey" type="button" class="secondary">Copy API key</button></div></div>
    <div id="developerKeyList" style="margin-top:12px"></div>
  </section>
  <section id="feedbackPanel" class="panel" hidden>
    <div class="eyebrow">PUBLIC TESTER FEEDBACK</div>
    <h2>Tell people what you tested on X</h2>
    <p class="muted">Post what worked, what felt confusing, and what you want Geomacro to improve. Public tester feedback also helps other builders discover the project.</p>
    <div class="actions"><button id="xFeedbackButton" type="button">Post feedback on X</button></div>
  </section>
  <section class="access">
    <div class="panel" style="margin-top:0">
      <div class="eyebrow">SUPPORTED TESTNETS</div>
      <div class="price">Multichain Testnet USDC</div>
      <div class="muted">Users can activate the same fixed tester entitlement from supported EVM testnets using configured USDC contracts. Unsupported chains fail closed.</div>
      <div class="notice">Testnet balances and Testnet USDC have no monetary value. These transfers are technical access proofs and are never booked as Geomacro commercial revenue.</div>
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