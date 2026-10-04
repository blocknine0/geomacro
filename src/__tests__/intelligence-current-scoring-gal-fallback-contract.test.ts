import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/intelligence-current-scoring-fastlane.yml', 'utf8');
const helper = readFileSync('scripts/lib/gdelt-gal-fastlane-fallback.mjs', 'utf8');

describe('current scoring GAL fallback contract', () => {
  it('falls back from DOC to governed GAL without bypassing canonical scoring', () => {
    expect(workflow).toContain('fetchGdeltArticlesWithGalFallback');
    expect(workflow).toContain("await fetchGdeltArticlesWithGalFallback(gdeltQuery, category.name)");
    expect(workflow).toContain("node scripts/ingest-news.js");
    expect(workflow).toContain("classification_version: 'event-severity-v1.0.5'");
    expect(workflow).toContain('raw_feature_score_promotion: false');
  });

  it('keeps GAL discovery bounded and timestamp-truthful', () => {
    expect(helper).toContain("MAX_PROBE_MINUTES = 12");
    expect(helper).toContain("MAX_SOURCE_FILES = 3");
    expect(helper).toContain("Fall back only to the real upstream GAL file minute");
    expect(helper).not.toMatch(/severity\s*:/i);
    expect(helper).not.toMatch(/confidence\s*:/i);
  });

  it('runs one-time serialized macro and rare-earth catch-up on workflow deployment', () => {
    expect(workflow).toContain("domain=macro");
    expect(workflow).toContain("recover-rare-earth-after-fastlane-change");
    expect(workflow).toContain("needs: score-current-domain");
    expect(workflow).toContain("GDELT_FORCE_CATEGORY: rare_earth");
    expect(workflow).toContain('cron: "13,33,53 * * * *"');
  });
});
