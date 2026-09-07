import { describe, expect, it } from 'vitest';

import {
  dispositionHash,
  dispositionStorageRowToCanonical,
} from '../../scripts/lib/gri-disposition-v12.js';

describe('GRI v1.2 disposition storage round-trip', () => {
  it('normalizes equivalent Postgres timestamp representations before hashing', () => {
    const canonical = {
      dispositionVersion: 'gri-disposition-v1.0.0',
      eventId: 'event-1',
      disposition: 'included',
      classificationSource: 'reassessment',

      category: 'geopolitics',

      sourceName: 'Example',
      sourceDomain: 'example.com',
      sourceUrl: 'https://example.com/story',
      sourceTitle: 'Example story',
      summary: 'Example summary',

      observedAt: '2026-09-07T16:58:45.628Z',
      publishedAt: '2026-09-07T15:00:00.000Z',

      classificationProvider: 'gemini',
      classificationModel: 'gemini-3.7-flash',
      classificationVersion: 'event-severity-v1.0.5',
      classificationPromptVersion: 'risk-desk-filter-v1.0.5',
      classificationScoredAt: '2026-09-07T16:55:00.000Z',
      classificationInputHash: 'a'.repeat(64),

      storyClusterId: 'story-1',

      rawWeight: 0.75,
      sourceEffectiveWeight: 0.7,
      preStoryEventWeight: 0.65,
      storyEffectiveWeight: 0.6,
      effectiveEventWeight: 0.55,
      contributionPoints: 12.34567891,
    };

    const stored = {
      disposition_version: canonical.dispositionVersion,
      event_id: canonical.eventId,
      disposition: canonical.disposition,
      classification_source: canonical.classificationSource,

      category: canonical.category,

      source_name: canonical.sourceName,
      source_domain: canonical.sourceDomain,
      source_url: canonical.sourceUrl,
      source_title: canonical.sourceTitle,
      summary: canonical.summary,

      // Equivalent instants in a Postgres-style UTC representation.
      observed_at: '2026-09-07 16:58:45.628+00',
      published_at: '2026-09-07 15:00:00+00',

      classification_provider: canonical.classificationProvider,
      classification_model: canonical.classificationModel,
      classification_version: canonical.classificationVersion,
      classification_prompt_version:
        canonical.classificationPromptVersion,
      classification_scored_at:
        '2026-09-07 16:55:00+00',
      classification_input_hash:
        canonical.classificationInputHash,

      story_cluster_id: canonical.storyClusterId,

      raw_weight: String(canonical.rawWeight),
      source_effective_weight:
        String(canonical.sourceEffectiveWeight),
      pre_story_event_weight:
        String(canonical.preStoryEventWeight),
      story_effective_weight:
        String(canonical.storyEffectiveWeight),
      effective_event_weight:
        String(canonical.effectiveEventWeight),
      contribution_points:
        String(canonical.contributionPoints),
    };

    const roundTripped =
      dispositionStorageRowToCanonical(stored);

    expect(roundTripped.observedAt).toBe(
      canonical.observedAt
    );

    expect(roundTripped.publishedAt).toBe(
      canonical.publishedAt
    );

    expect(roundTripped.classificationScoredAt).toBe(
      canonical.classificationScoredAt
    );

    expect(
      dispositionHash([roundTripped])
    ).toBe(
      dispositionHash([canonical])
    );
  });
});
