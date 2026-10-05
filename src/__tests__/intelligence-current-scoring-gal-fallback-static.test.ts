import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const workflow = fs.readFileSync('.github/workflows/intelligence-current-scoring-fastlane.yml', 'utf8');
const orchestrator = fs.readFileSync('scripts/intelligence-orchestrator.mjs', 'utf8');
const runner = fs.readFileSync('scripts/ops/run-intelligence-current-scoring-cycle.mjs', 'utf8');
const helper = fs.readFileSync('scripts/lib/gdelt-gal-fastlane-fallback.mjs', 'utf8');

describe('#1414 current scoring GAL fallback', () => {
  it('uses governed GDELT GAL only as a bounded discovery fallback', () => {
    expect(runner).toContain('GDELT_GAL_FALLBACK_ENABLED: "true"');
    expect(runner).toContain('fetchGdeltArticlesWithGalFallback');
    expect(runner).toContain('gdelt-gal-fastlane-fallback.mjs');
    expect(helper).toContain('storage.googleapis.com/data.gdeltproject.org/gdeltv3/gal');
    expect(helper).toContain('MAX_PROBE_REQUESTS = 60');
    expect(helper).toContain('MAX_PARALLEL_PROBES = 6');
    expect(helper).toContain('HEARTBEAT_OFFSETS = Object.freeze([1, 2, 3, 4, 5])');
  });

  it('preserves real upstream time and never promotes source features to severity', () => {
    expect(helper).toContain('Fall back only to the real upstream GAL file minute');
    expect(helper).not.toContain('severity:');
    expect(helper).not.toContain('confidence:');
    expect(runner).toContain('raw_feature_score_promotion: false');
    expect(runner).toContain('const CLASSIFICATION_VERSION = "event-severity-v1.0.5"');
  });

  it('pre-filters on article evidence rather than publisher identity', () => {
    expect(helper).toContain("const title = String(row?.title || '').trim()");
    expect(helper).toContain("const description = String(row?.desc || '').trim()");
    expect(helper).not.toContain("[row?.title, row?.desc, row?.domain, row?.outletName]");
    expect(helper).toContain('topicScore');
  });

  it('keeps recurring load bounded under one scheduler while manual recovery stays non-recurring', () => {
    expect(runner).toContain('const DOMAINS = ["geopolitics", "macro", "rare_earth"]');
    expect(runner).toContain('for (const category of DOMAINS)');
    expect(orchestrator).toContain('key: "current_scoring"');
    expect(orchestrator).toContain('cadenceSeconds: 1200');
    expect(orchestrator).toContain('scripts/ops/run-intelligence-current-scoring-cycle.mjs');
    expect(workflow).toContain('workflow_dispatch');
    expect(workflow).not.toContain('schedule:');
    expect(workflow).toContain('geomacro-intelligence-orchestrator');
    expect(workflow).toContain('MAX_CANDIDATES_PER_CATEGORY: "1"');
    expect(workflow).toContain('INTELLIGENCE_ORCHESTRATOR_TASK_ALLOWLIST: current_scoring');
  });
});
