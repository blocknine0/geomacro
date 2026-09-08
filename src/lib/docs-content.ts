import manifestJson from "@/content/docs-manifest.json";

export type DocsManifestEntry = {
  order: number;
  page_number: number;
  page_count: number;
  slug: string;
  title: string;
  route: string;
  previous: string | null;
  next: string | null;
};

const TITLE_OVERRIDES: Record<string, string> = {
  "17-orthogonal-event-residual": "Story Correlation and Evidence Caps",
  "18-gro-v0-2-phase-2-methodology-freeze": "Signed Risk Object Contract",
  "40-middle-east-validation": "Regional Validation",
};

export const DOCS_MANIFEST = (manifestJson as DocsManifestEntry[]).map((entry) => ({
  ...entry,
  title: TITLE_OVERRIDES[entry.slug] ?? entry.title,
}));
export const DOCS_PAGE_COUNT = DOCS_MANIFEST.length;

const rawFiles = import.meta.glob("../content/docs/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const bySlug: Record<string, string> = {};
for (const [path, raw] of Object.entries(rawFiles)) {
  const slug = path.split("/").pop()?.replace(/\.md$/, "");
  if (slug) bySlug[slug] = raw;
}

function cleanMarkdown(raw: string): string {
  let body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
  body = body.replace(/<!--[\s\S]*?-->/g, "");
  return body.trim();
}

export type DocsHeading = { id: string; text: string; level: 2 | 3; line: number };

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function extractHeadings(markdown: string): DocsHeading[] {
  const headings: DocsHeading[] = [];
  const seen = new Map<string, number>();
  let inFence = false;
  const lines = markdown.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^(#{2,3})\s+(.*)$/.exec(line);
    if (!match) continue;
    const text = match[2].replace(/\*\*/g, "").replace(/`/g, "").trim();
    const base = slugifyHeading(text) || `section-${index + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    headings.push({
      id: count === 0 ? base : `${base}-${count}`,
      text,
      level: match[1].length === 2 ? 2 : 3,
      line: index + 1,
    });
  }

  return headings;
}

export type DocsPage = DocsManifestEntry & {
  markdown: string;
  headings: DocsHeading[];
  previousEntry: DocsManifestEntry | null;
  nextEntry: DocsManifestEntry | null;
};

export function getDocsEntry(slug: string): DocsManifestEntry | null {
  return DOCS_MANIFEST.find((entry) => entry.slug === slug) ?? null;
}

export function getDocsPage(slug: string): DocsPage | null {
  const entry = getDocsEntry(slug);
  const raw = bySlug[slug];
  if (!entry || !raw) return null;
  const markdown = cleanMarkdown(raw);
  return {
    ...entry,
    markdown,
    headings: extractHeadings(markdown),
    previousEntry: entry.previous ? getDocsEntry(entry.previous) : null,
    nextEntry: entry.next ? getDocsEntry(entry.next) : null,
  };
}

export type DocsGroup = { title: string; entries: DocsManifestEntry[] };

const GROUP_RANGES = [
  { title: "Start here", from: 0, to: 1 },
  { title: "Architecture & products", from: 2, to: 3 },
  { title: "Evidence & sources", from: 4, to: 10 },
  { title: "Country intelligence", from: 11, to: 12 },
  { title: "Confidence & reliability", from: 13, to: 15 },
  { title: "Risk methodology", from: 16, to: 21 },
  { title: "Machine intelligence & access", from: 22, to: 27 },
  { title: "Partners & commercial", from: 28, to: 29 },
  { title: "Applied risk intelligence", from: 30, to: 33 },
  { title: "Labs / technical proof", from: 34, to: 37 },
  { title: "Global coverage", from: 38, to: 41 },
  { title: "Integrity & determinism", from: 42, to: 44 },
  { title: "Roadmap & reference", from: 45, to: 51 },
] as const;

function docNumber(slug: string): number {
  return Number.parseInt(slug.slice(0, 2), 10);
}

export const DOCS_GROUPS: DocsGroup[] = GROUP_RANGES.map((range) => ({
  title: range.title,
  entries: DOCS_MANIFEST.filter((entry) => {
    const n = docNumber(entry.slug);
    return n >= range.from && n <= range.to;
  }),
})).filter((group) => group.entries.length > 0);
