import {
  GEOMACRO_LOGO_DATA_URI,
  GEOMACRO_LOGO_INTRINSIC_HEIGHT,
  GEOMACRO_LOGO_INTRINSIC_WIDTH,
} from "./geomacro-logo-embedded";

export const TESTNET_SOCIAL_CARD_VERSION = "geomacro-testnet-card-v2" as const;

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
  const summaryLines = wrap(card.summary, 68, 3);
  const score = card.score === null ? "N/A" : Math.round(card.score).toString();
  const delta = card.delta === null ? "—" : `${card.delta >= 0 ? "+" : ""}${card.delta.toFixed(1)}`;
  const confidence = card.confidence === null ? "N/A" : `${Math.round(card.confidence)}%`;
  const byline = card.profile_name ? `Shared by ${card.profile_name}` : "Geomacro Testnet Intelligence";
  const logoHeight = 46;
  const logoWidth = Math.round((logoHeight * GEOMACRO_LOGO_INTRINSIC_WIDTH) / GEOMACRO_LOGO_INTRINSIC_HEIGHT);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="Geomacro Testnet intelligence card">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#0a0f18"/>
      <stop offset="0.55" stop-color="#080d16"/>
      <stop offset="1" stop-color="#05080e"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.12" cy="0.02" r="0.75">
      <stop offset="0" stop-color="#ff9d19" stop-opacity="0.20"/>
      <stop offset="1" stop-color="#ff9d19" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="0.95" cy="1" r="0.6">
      <stop offset="0" stop-color="#ff9d19" stop-opacity="0.08"/>
      <stop offset="1" stop-color="#ff9d19" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M40 0H0V40" fill="none" stroke="#ffffff" stroke-opacity="0.035" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#grid)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <rect width="1200" height="630" fill="url(#glow2)"/>
  <rect x="0" y="0" width="1200" height="4" fill="#ff9d19"/>

  <image x="72" y="58" width="${logoWidth}" height="${logoHeight}" href="${GEOMACRO_LOGO_DATA_URI}" xlink:href="${GEOMACRO_LOGO_DATA_URI}" preserveAspectRatio="xMinYMid meet"/>

  <g transform="translate(834 62)">
    <rect width="294" height="38" rx="19" fill="#ffffff" fill-opacity="0.035" stroke="#ffffff" stroke-opacity="0.10"/>
    <circle cx="22" cy="19" r="4.5" fill="#ff9d19"/>
    <text x="38" y="24" font-family="Inter,Arial,sans-serif" font-size="13" font-weight="700" letter-spacing="1.3" fill="#c9cbd0">TESTNET · RISK INTELLIGENCE</text>
  </g>

  <line x1="72" y1="146" x2="1128" y2="146" stroke="#ffffff" stroke-opacity="0.08" stroke-width="1"/>

  <text x="72" y="198" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="15" letter-spacing="2" fill="#ff9d19">${esc(card.chain.toUpperCase())}</text>
  <text x="72" y="256" font-family="Inter,Arial,sans-serif" font-size="46" font-weight="750" letter-spacing="-1" fill="#f4f2ea">${esc(card.subject)}</text>

  ${summaryLines
    .map(
      (line, index) =>
        `<text x="72" y="${312 + index * 34}" font-family="Inter,Arial,sans-serif" font-size="22" fill="#a8adb6">${esc(line)}</text>`,
    )
    .join("\n  ")}

  <g transform="translate(72 428)">
    <rect width="330" height="106" rx="16" fill="#ffffff" fill-opacity="0.035" stroke="#ffffff" stroke-opacity="0.09"/>
    <rect x="0" y="0" width="4" height="106" rx="2" fill="#ff9d19"/>
    <text x="24" y="36" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="12" letter-spacing="1.6" fill="#979fab">RISK SCORE</text>
    <text x="24" y="84" font-family="Inter,Arial,sans-serif" font-size="42" font-weight="760" fill="#f4f2ea">${esc(score)}</text>
  </g>
  <g transform="translate(435 428)">
    <rect width="330" height="106" rx="16" fill="#ffffff" fill-opacity="0.035" stroke="#ffffff" stroke-opacity="0.09"/>
    <text x="24" y="36" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="12" letter-spacing="1.6" fill="#979fab">CHANGE</text>
    <text x="24" y="84" font-family="Inter,Arial,sans-serif" font-size="36" font-weight="730" fill="#f4f2ea">${esc(delta)}</text>
  </g>
  <g transform="translate(798 428)">
    <rect width="330" height="106" rx="16" fill="#ffffff" fill-opacity="0.035" stroke="#ffffff" stroke-opacity="0.09"/>
    <text x="24" y="36" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="12" letter-spacing="1.6" fill="#979fab">CONFIDENCE</text>
    <text x="24" y="84" font-family="Inter,Arial,sans-serif" font-size="36" font-weight="730" fill="#f4f2ea">${esc(confidence)}</text>
  </g>

  <line x1="72" y1="566" x2="1128" y2="566" stroke="#ffffff" stroke-opacity="0.08" stroke-width="1"/>
  <text x="72" y="596" font-family="Inter,Arial,sans-serif" font-size="15" fill="#79808c">${esc(byline)}</text>
  <text x="1128" y="596" text-anchor="end" font-family="Inter,Arial,sans-serif" font-size="16" font-weight="700" fill="#f4f2ea">geomacro.live</text>
</svg>`;
}