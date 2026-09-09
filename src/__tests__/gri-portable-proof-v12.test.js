import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  GRI_STORY_CORRELATION_PROMPT_VERSION,
  GRI_STORY_CORRELATION_VERSION,
  calculateGri,
} from '../../scripts/lib/gri-engine-v12.js';

import {
  GRI_DISPOSITION,
  buildSourceDisposition,
} from '../../scripts/lib/gri-disposition-v12.js';

import {
  GRI_PORTABLE_PROOF_BUNDLE_VERSION,
  buildPortableGriProofBundle,
  verifyPortableGriProofBundle,
} from '../../scripts/lib/gri-portable-proof-v12.js';

const PREVIOUS_AS_OF =
  new Date('2026-09-09T12:00:00.000Z');
const CURRENT_AS_OF =
  new Date('2026-09-09T13:00:00.000Z');

function row({
  id,
  category,
  severity,
  confidence,
  createdAt,
  sourceDomain,
  story,
}) {
  return {
    id,
    category,
    severity,
    confidence,
    created_at: createdAt,
    published_at: createdAt,
    source_name: sourceDomain,
    source_domain: sourceDomain,
    source_url:
      `https://${sourceDomain}/${id}`,
    source_title:
      `Structured event ${id}`,
    summary:
      `Evidence summary ${id}`,
    story_cluster_id: story,
    story_canonical_label:
      `Story ${story}`,
    story_assignment_decision:
      'anchor',
    story_match_confidence: 100,
    story_decision_rationale:
      'Deterministic test fixture',
    story_clustering_provider:
      'fixture-provider',
    story_clustering_model:
      'fixture-model',
    story_clustering_version:
      GRI_STORY_CORRELATION_VERSION,
    story_clustering_prompt_version:
      GRI_STORY_CORRELATION_PROMPT_VERSION,
    story_clustering_scored_at:
      createdAt,
    story_clustering_input_hash:
      'a'.repeat(64),
    classification_provider:
      'fixture-provider',
    classification_model:
      'fixture-model',
    classification_version:
      'event-severity-v1.0.5',
    classification_prompt_version:
      'risk-desk-filter-v1.0.5',
    classification_scored_at:
      createdAt,
    classification_input_hash:
      'b'.repeat(64),
  };
}

const previousRows = [
  row({
    id: 'geo-1',
    category: 'geopolitics',
    severity: 55,
    confidence: 90,
    createdAt:
      '2026-09-09T10:00:00.000Z',
    sourceDomain: 'source-a.test',
    story: 'story-geo-1',
  }),
  row({
    id: 'macro-1',
    category: 'macro',
    severity: 45,
    confidence: 85,
    createdAt:
      '2026-09-09T10:15:00.000Z',
    sourceDomain: 'source-b.test',
    story: 'story-macro-1',
  }),
  row({
    id: 'rare-1',
    category: 'rare_earth',
    severity: 35,
    confidence: 80,
    createdAt:
      '2026-09-09T10:30:00.000Z',
    sourceDomain: 'source-c.test',
    story: 'story-rare-1',
  }),
];

const currentRows = [
  ...previousRows,
  row({
    id: 'geo-2',
    category: 'geopolitics',
    severity: 92,
    confidence: 95,
    createdAt:
      '2026-09-09T12:30:00.000Z',
    sourceDomain: 'source-d.test',
    story: 'story-geo-2',
  }),
];

function includedDispositions(
  rows,
  calculation,
) {
  const rowsById =
    new Map(
      rows.map((item) => [
        String(item.id),
        item,
      ]),
    );

  return calculation.contributions.map(
    (contribution) =>
      buildSourceDisposition({
        event:
          rowsById.get(
            contribution.eventId,
          ),
        disposition:
          GRI_DISPOSITION.INCLUDED,
        classificationSource:
          'direct',
        contribution,
      }),
  );
}

function fixtureBundle() {
  const previous =
    calculateGri(
      previousRows,
      PREVIOUS_AS_OF,
    );
  const current =
    calculateGri(
      currentRows,
      CURRENT_AS_OF,
    );

  return buildPortableGriProofBundle({
    previousCalculation: previous,
    currentCalculation: current,
    dispositions:
      includedDispositions(
        currentRows,
        current,
      ),
  });
}

describe(
  'GRI v1.2 portable proof bundle',
  () => {
    it(
      'reproduces canonical manifests, score reconciliation, attribution and proof hash offline',
      () => {
        const bundle = fixtureBundle();
        const report =
          verifyPortableGriProofBundle(
            bundle,
            {
              expectedProofHash:
                bundle.proof.proofHash,
            },
          );

        expect(
          bundle.bundleVersion,
        ).toBe(
          GRI_PORTABLE_PROOF_BUNDLE_VERSION,
        );
        expect(report.valid).toBe(true);
        expect(
          report.internallyReproducible,
        ).toBe(true);
        expect(
          report.authenticityAnchored,
        ).toBe(true);
        expect(
          report.authenticAgainstExpectedHash,
        ).toBe(true);
        expect(
          Object.values(report.checks)
            .every(
              (value) =>
                value === true,
            ),
        ).toBe(true);
        expect(
          Math.abs(
            report.recomputed
              .contributionResidual,
          ),
        ).toBeLessThanOrEqual(1e-6);
        expect(
          Math.abs(
            report.recomputed
              .eventChangeResidual,
          ),
        ).toBeLessThanOrEqual(1e-6);
      },
    );

    it(
      'separates internal reproducibility from issuer authenticity',
      () => {
        const report =
          verifyPortableGriProofBundle(
            fixtureBundle(),
          );

        expect(report.valid).toBe(true);
        expect(
          report.internallyReproducible,
        ).toBe(true);
        expect(
          report.authenticityAnchored,
        ).toBe(false);
        expect(
          report.authenticAgainstExpectedHash,
        ).toBe(false);
        expect(
          report.checks.expectedProofHash,
        ).toBe(null);
      },
    );

    it(
      'detects exact reproduction-state tampering',
      () => {
        const bundle = fixtureBundle();
        const tampered =
          structuredClone(bundle);

        tampered.current
          .reproduction
          .contributions[0]
          .contributionPoints += 7;

        const report =
          verifyPortableGriProofBundle(
            tampered,
          );

        expect(report.valid).toBe(false);
        expect(
          report.checks
            .currentCalculationManifest,
        ).toBe(false);
        expect(
          report.checks
            .contributionReconciliation,
        ).toBe(false);
      },
    );

    it(
      'detects attribution tampering',
      () => {
        const bundle = fixtureBundle();
        const tampered =
          structuredClone(bundle);

        tampered.attribution
          .eventChanges[0]
          .deltaPoints += 5;

        const report =
          verifyPortableGriProofBundle(
            tampered,
          );

        expect(report.valid).toBe(false);
        expect(
          report.checks.attribution,
        ).toBe(false);
        expect(
          report.checks.bundleHash,
        ).toBe(false);
      },
    );

    it(
      'detects disposition-ledger tampering',
      () => {
        const bundle = fixtureBundle();
        const tampered =
          structuredClone(bundle);

        tampered.current
          .dispositions[0]
          .classificationSource =
            'reassessment';

        const report =
          verifyPortableGriProofBundle(
            tampered,
          );

        expect(report.valid).toBe(false);
        expect(
          report.checks.dispositionHash,
        ).toBe(false);
        expect(
          report.checks.bundleHash,
        ).toBe(false);
      },
    );

    it(
      'rejects a wrong independent trusted proof hash while preserving internal reproducibility',
      () => {
        const report =
          verifyPortableGriProofBundle(
            fixtureBundle(),
            {
              expectedProofHash:
                'f'.repeat(64),
            },
          );

        expect(report.valid).toBe(false);
        expect(
          report.internallyReproducible,
        ).toBe(true);
        expect(
          report.authenticAgainstExpectedHash,
        ).toBe(false);
        expect(
          report.reasonCodes,
        ).toContain(
          'trusted_proof_hash_mismatch',
        );
      },
    );
  },
);