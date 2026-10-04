import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/intelligence-current-scoring-fastlane.yml', 'utf8');
const helper = fs.readFileSync('scripts/lib/gdelt-gal-fastlane-fallback.mjs', 'utf8');

describe('#1414 current scoring GAL fallback', () => {
  it('uses governed GDELT GAL only as a bounded discovery fallback', () => {
    expect(workflow).toContain('GDELT_GAL_FALLBACK_ENABLED: "true"');
    expect(workflow).toContain('fetchGdeltArticlesWithGalFallback');
    expect(workflow).toContain('gdelt-gal-fastlane-fallback.mjs');
    expect(helper).toContain('storage.googleapis.com/data.gdeltproject.org/gdeltv3/gal');
    expect(helper).toContain('MAX_PROBE_REQUESTS = 60');
    expect(helper).toContain('MAX_PARALLEL_PROBES = 6');
    expect(helper).toContain('HEARTBEAT_OFFSETS = Object.freeze([1, 2, 3, 4, 5])');
  });

  it('preserves real upstream time and never promotes source features to severity', () => {
    expect(helper).toContain('Fall back only to the real upstream GAL file minute');
    expect(helper).not.toContain('severity:');
    expect(helper).not.toContain('confidence:');
    expect(workflow).toContain('raw_feature_score_promotion: false');
    expect(workflow).toContain("classification_version: 'event-severity-v1.0.5'");
  });

  it('pre-filters on article evidence rather than publisher identity', () => {
    expect(helper).toContain("const title = String(row?.title || '').trim()");
    expect(helper).toContain("const description = String(row?.desc || '').trim()");
    expect(helper).not.toContain("[row?.title, row?.desc, row?.domain, row?.outletName]");
    expect(helper).toContain('topicScore');
  });

  it('keeps recurring load bounded while catch-up remains serialized', () => {
    expect(workflow).toContain('GITHUB_EVENT_NAME');
    expect(workflow).toContain('domain=macro');
    expect(workflow).toContain('recover-rare-earth-after-fastlane-change');
    expect(workflow).toContain('needs: score-current-domain');
    expect(workflow).toContain('cron: "13,33,53 * * * *"');
    expect(workflow).toContain('geomacro-intelligence-orchestrator');
    expect(workflow).toContain('MAX_CANDIDATES_PER_CATEGORY: "2"');
  });
});
