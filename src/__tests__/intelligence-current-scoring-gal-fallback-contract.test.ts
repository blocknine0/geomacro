import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { candidateStamps, scoreTopicEvidence } from '../../scripts/lib/gdelt-gal-fastlane-fallback.mjs';

const workflow = readFileSync('.github/workflows/intelligence-current-scoring-fastlane.yml', 'utf8');
const orchestrator = readFileSync('scripts/intelligence-orchestrator.mjs', 'utf8');
const runner = readFileSync('scripts/ops/run-intelligence-current-scoring-cycle.mjs', 'utf8');
const helper = readFileSync('scripts/lib/gdelt-gal-fastlane-fallback.mjs', 'utf8');

describe('current scoring GAL fallback contract', () => {
  it('falls back from DOC to governed GAL without bypassing canonical scoring', () => {
    expect(runner).toContain('fetchGdeltArticlesWithGalFallback');
    expect(runner).toContain('await fetchGdeltArticlesWithGalFallback(gdeltQuery, category.name);');
    expect(runner).toContain('const SCORER = "scripts/ingest-news.js"');
    expect(runner).toContain('const CLASSIFICATION_VERSION = "event-severity-v1.0.5"');
    expect(runner).toContain('raw_feature_score_promotion: false');
    expect(runner).toContain('GDELT_GAL_FALLBACK_ENABLED: "true"');
  });

  it('keeps normal GAL discovery bounded, densely heartbeat-aware and timestamp-truthful', () => {
    expect(helper).toContain('MAX_PROBE_REQUESTS = 60');
    expect(helper).toContain('MAX_PARALLEL_PROBES = 6');
    expect(helper).toContain('HEARTBEAT_MINUTES = 15');
    expect(helper).toContain('HEARTBEAT_OFFSETS = Object.freeze([1, 2, 3, 4, 5])');
    expect(helper).toContain('Fall back only to the real upstream GAL file minute');
    expect(helper).not.toMatch(/severity\s*:/i);
    expect(helper).not.toMatch(/confidence\s*:/i);

    const now = new Date('2026-10-04T19:44:00.000Z');
    const stamps = candidateStamps(now, 300);
    expect(stamps.length).toBeGreaterThan(20);
    expect(stamps.length).toBeLessThanOrEqual(60);
    expect(stamps[0]).toBe('20261004194300');
    for (const minute of ['31', '32', '33', '34', '35']) {
      expect(stamps).toContain(`2026100419${minute}00`);
    }
    const oldest = stamps.at(-1)!;
    const oldestMs = Date.UTC(
      Number(oldest.slice(0, 4)), Number(oldest.slice(4, 6)) - 1, Number(oldest.slice(6, 8)),
      Number(oldest.slice(8, 10)), Number(oldest.slice(10, 12)), 0,
    );
    expect(now.getTime() - oldestMs).toBeGreaterThan(2 * 60 * 60 * 1000);
  });

  it('gives low-volume rare-earth discovery a 24h bounded sparse tail without inventing timestamps', () => {
    expect(helper).toContain('RARE_EARTH_LOOKBACK_MINUTES = 24 * 60');
    expect(helper).toContain('RARE_EARTH_DENSE_RECENT_MINUTES = 60');
    expect(helper).toContain('RARE_EARTH_SPARSE_INTERVAL_MINUTES = 45');
    expect(helper).toContain("categoryName === 'rare_earth'");

    const now = new Date('2026-10-04T19:44:00.000Z');
    const stamps = candidateStamps(now, 24 * 60, 'rare_earth');
    expect(stamps.length).toBeGreaterThan(45);
    expect(stamps.length).toBeLessThanOrEqual(60);
    expect(stamps[0]).toBe('20261004194300');
    const oldest = stamps.at(-1)!;
    const oldestMs = Date.UTC(
      Number(oldest.slice(0, 4)), Number(oldest.slice(4, 6)) - 1, Number(oldest.slice(6, 8)),
      Number(oldest.slice(8, 10)), Number(oldest.slice(10, 12)), 0,
    );
    expect(now.getTime() - oldestMs).toBeGreaterThan(18 * 60 * 60 * 1000);
    expect(now.getTime() - oldestMs).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });

  it('rejects the observed macro false positive before classifier quota is spent', () => {
    expect(scoreTopicEvidence({
      title: 'FGR asegura más de 94 litros de cocaína ocultos en botellas en Apodaca, Nuevo León',
      desc: 'La Fiscalía informó sobre el operativo y la investigación criminal.',
      outletName: 'Noticias Macro',
      domain: 'macro.example',
    }, 'macro')).toBe(0);

    expect(scoreTopicEvidence({
      title: 'Global bond sell-off intensifies as sovereign yields jump after central bank warning',
      desc: 'Markets repriced interest rates and inflation expectations.',
    }, 'macro')).toBeGreaterThanOrEqual(3);
  });

  it('admits real critical-mineral evidence across common languages while requiring context for broad minerals', () => {
    expect(scoreTopicEvidence({
      title: 'Rare earth export controls tighten as magnet supply chain faces disruption',
      desc: 'Neodymium and dysprosium producers face new restrictions.',
    }, 'rare_earth')).toBeGreaterThanOrEqual(3);

    expect(scoreTopicEvidence({
      title: 'Lithium mine output cut after processing bottleneck',
      desc: 'The producer lowered mineral production guidance amid weaker supply.',
    }, 'rare_earth')).toBeGreaterThanOrEqual(3);

    expect(scoreTopicEvidence({
      title: 'China endurece controles sobre tierras raras y minerales críticos',
      desc: 'Las nuevas reglas afectan la exportación y la cadena de suministro.',
    }, 'rare_earth')).toBeGreaterThanOrEqual(3);

    expect(scoreTopicEvidence({
      title: 'La Chine resserre ses règles sur les terres rares',
      desc: 'Les minéraux critiques restent au centre des restrictions commerciales.',
    }, 'rare_earth')).toBeGreaterThanOrEqual(3);

    expect(scoreTopicEvidence({
      title: 'Lithium battery tips for your phone',
      desc: 'A consumer guide to extending battery life.',
    }, 'rare_earth')).toBeLessThan(3);
  });

  it('scores all three domains serially under the single recurring owner', () => {
    expect(runner).toContain('const DOMAINS = ["geopolitics", "macro", "rare_earth"]');
    expect(runner).toContain('for (const category of DOMAINS)');
    expect(orchestrator).toContain('key: "current_scoring"');
    expect(orchestrator).toContain('cadenceSeconds: 1200');
    expect(orchestrator).toContain('scripts/ops/run-intelligence-current-scoring-cycle.mjs');
    expect(workflow).toContain('workflow_dispatch');
    expect(workflow).not.toContain('schedule:');
    expect(workflow).toContain('INTELLIGENCE_ORCHESTRATOR_TASK_ALLOWLIST: current_scoring');
    expect(workflow).toContain('INTELLIGENCE_ORCHESTRATOR_FORCE_TASKS: current_scoring');
    expect(workflow).toContain('group: geomacro-intelligence-orchestrator');
  });
});
