export type FreeApiSharePayload = {
  canonical_url: string;
  text: string;
  copy_text: string;
  platforms: {
    x: string;
    linkedin: string;
    reddit: string;
    whatsapp: string;
    telegram: string;
  };
};

function subjectLabel(subject: Record<string, unknown>): string {
  if (subject.type === "country") {
    return String(subject.country_iso3 ?? "country").toUpperCase();
  }
  if (subject.type === "corridor") {
    return `${String(subject.origin_country_iso3 ?? "").toUpperCase()}→${String(subject.destination_country_iso3 ?? "").toUpperCase()}`;
  }
  return "global risk";
}

function encoded(value: string): string {
  return encodeURIComponent(value);
}

export function buildFreeApiShare(input: {
  capability: string;
  subject: Record<string, unknown>;
}): FreeApiSharePayload {
  const canonicalUrl = "https://geomacro.live/data-api";
  const label = subjectLabel(input.subject);
  const text = `I checked ${label} with Geomacro's free geopolitical and macro risk API. Machine-readable risk context, with deeper data available on paid plans.`;
  const shareText = `${text} ${canonicalUrl}`;

  return {
    canonical_url: canonicalUrl,
    text,
    copy_text: shareText,
    platforms: {
      x: `https://x.com/intent/post?text=${encoded(shareText)}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encoded(canonicalUrl)}`,
      reddit: `https://www.reddit.com/submit?url=${encoded(canonicalUrl)}&title=${encoded(text)}`,
      whatsapp: `https://wa.me/?text=${encoded(shareText)}`,
      telegram: `https://t.me/share/url?url=${encoded(canonicalUrl)}&text=${encoded(text)}`,
    },
  };
}
