export const TESTNET_SOCIAL_CARD_VERSION = "geomacro-testnet-card-v1" as const;

export type TestnetSocialCardInput = {
  subject: string;
  summary: string;
  score?: number | null;
  delta?: number | null;
  confidence?: number | null;
  chain?: string | null;
  profile_name?: string | null;
};

function clampText(value: unknown, max: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function clampNumber(value: unknown, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(max, Math.max(min, parsed));
}

function esc(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function wrap(value: string, width: number, lines: number) {
  const words = value.split(" ").filter(Boolean);
  const out: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= width) {
      line = next;
      continue;
    }
    if (line) out.push(line);
    line = word;
    if (out.length >= lines - 1) break;
  }
  if (out.length < lines && line) out.push(line);
  if (out.length === lines && words.join(" ").length > out.join(" ").length) {
    out[lines - 1] = `${out[lines - 1].slice(0, Math.max(0, width - 1)).trimEnd()}…`;
  }
  return out;
}

export function normalizeTestnetSocialCardInput(input: TestnetSocialCardInput) {
  return {
    subject: clampText(input.subject, 72) || "Geomacro Risk Intelligence",
    summary: clampText(input.summary, 220) || "Explainable geopolitical and macro risk intelligence for testing.",
    score: clampNumber(input.score, 0, 100),
    delta: clampNumber(input.delta, -100, 100),
    confidence: clampNumber(input.confidence, 0, 100),
    chain: clampText(input.chain, 32) || "Multichain Testnet",
    profile_name: clampText(input.profile_name, 48) || null,
  } as const;
}

export function renderTestnetSocialCardSvg(input: TestnetSocialCardInput) {
  const card = normalizeTestnetSocialCardInput(input);
  const summaryLines = wrap(card.summary, 70, 3);
  const score = card.score === null ? "N/A" : Math.round(card.score).toString();
  const delta = card.delta === null ? "—" : `${card.delta >= 0 ? "+" : ""}${card.delta.toFixed(1)}`;
  const confidence = card.confidence === null ? "N/A" : `${Math.round(card.confidence)}%`;
  const byline = card.profile_name ? `Shared by ${card.profile_name}` : "Geomacro Testnet Intelligence";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="Geomacro Testnet intelligence card">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#080b12"/>
      <stop offset="1" stop-color="#101827"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" x2="1">
      <stop offset="0" stop-color="#8fb3ff"/>
      <stop offset="1" stop-color="#86e7c5"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" rx="0" fill="url(#bg)"/>
  <rect x="54" y="46" width="1092" height="538" rx="28" fill="#0c111c" stroke="#263248" stroke-width="2"/>
  <rect x="54" y="46" width="8" height="538" rx="4" fill="url(#accent)"/>

  <g transform="translate(92 88)">
    <rect x="0" y="0" width="42" height="42" rx="11" fill="#eef4ff"/>
    <path d="M10 22c8-14 19-14 25-6-8-2-13 1-16 6 4-1 9 1 13 7-8 2-15-1-22-7Z" fill="#0b1220"/>
    <text x="58" y="30" font-family="Inter,Arial,sans-serif" font-size="28" font-weight="700" fill="#f5f8fc">Geomacro</text>
  </g>

  <g transform="translate(862 92)">
    <rect width="244" height="36" rx="18" fill="#111c2d" stroke="#334766"/>
    <circle cx="19" cy="18" r="5" fill="#86e7c5"/>
    <text x="34" y="23" font-family="Inter,Arial,sans-serif" font-size="13" font-weight="700" letter-spacing="1.2" fill="#c7d7ef">TESTNET · USDC ACCESS</text>
  </g>

  <text x="92" y="196" font-family="Inter,Arial,sans-serif" font-size="18" font-weight="600" fill="#91a2bc">${esc(card.chain)}</text>
  <text x="92" y="246" font-family="Inter,Arial,sans-serif" font-size="42" font-weight="750" fill="#f7f9fc">${esc(card.subject)}</text>

  ${summaryLines.map((line, index) => `<text x="92" y="${306 + index * 34}" font-family="Inter,Arial,sans-serif" font-size="22" fill="#c1ccdb">${esc(line)}</text>`).join("\n  ")}

  <g transform="translate(92 418)">
    <rect width="248" height="102" rx="18" fill="#111827" stroke="#25324a"/>
    <text x="20" y="31" font-family="Inter,Arial,sans-serif" font-size="13" font-weight="600" fill="#8495ae">RISK SCORE</text>
    <text x="20" y="78" font-family="Inter,Arial,sans-serif" font-size="40" font-weight="760" fill="#f7f9fc">${esc(score)}</text>
  </g>
  <g transform="translate(358 418)">
    <rect width="248" height="102" rx="18" fill="#111827" stroke="#25324a"/>
    <text x="20" y="31" font-family="Inter,Arial,sans-serif" font-size="13" font-weight="600" fill="#8495ae">CHANGE</text>
    <text x="20" y="78" font-family="Inter,Arial,sans-serif" font-size="34" font-weight="730" fill="#f7f9fc">${esc(delta)}</text>
  </g>
  <g transform="translate(624 418)">
    <rect width="248" height="102" rx="18" fill="#111827" stroke="#25324a"/>
    <text x="20" y="31" font-family="Inter,Arial,sans-serif" font-size="13" font-weight="600" fill="#8495ae">CONFIDENCE</text>
    <text x="20" y="78" font-family="Inter,Arial,sans-serif" font-size="34" font-weight="730" fill="#f7f9fc">${esc(confidence)}</text>
  </g>

  <text x="92" y="558" font-family="Inter,Arial,sans-serif" font-size="14" fill="#718198">${esc(byline)}</text>
  <text x="1106" y="558" text-anchor="end" font-family="Inter,Arial,sans-serif" font-size="15" font-weight="700" fill="#b7c5d8">geomacro.live</text>
</svg>`;
}
