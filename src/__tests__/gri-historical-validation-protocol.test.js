import {
  readFileSync,
} from 'node:fs';

import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  validateReplayWindows,
} from '../../scripts/validate-gri-replay-windows.mjs';

const protocol = JSON.parse(
  readFileSync(
    'validation/gri-known-event-windows.v1.json',
    'utf8',
  ),
);

function snapshot(
  asOf,
  rawScore,
  overrides = {},
) {
  return {
    as_of: asOf,
    raw_score: rawScore,
    display_score: Math.round(rawScore),
    coverage: 1,
    proof_verified: true,
    proof_version: 'gri-proof-v1.2.0',
    proof_hash: 'a'.repeat(64),
    ...overrides,
  };
}

function windowSnapshots(
  window,
  baselineScore = 40,
  evaluationScore = 65,
) {
  const eventMs = Date.parse(window.event_at);
  return [
    snapshot(
      new Date(
        eventMs - 80 * 3_600_000,
      ).toISOString(),
      baselineScore,
    ),
    snapshot(
      new Date(
        eventMs + 80 * 3_600_000,
      ).toISOString(),
      evaluationScore,
    ),
  ];
}

describe(
  'GRI historical validation protocol',
  () => {
    it(
      'never converts retrospective replay into a predictive-performance claim',
      () => {
        const window = protocol.windows[0];
        const result = validateReplayWindows(
          windowSnapshots(window),
          {
            ...protocol,
            windows: [window],
          },
        );

        expect(result.evidence_class).toBe(
          'retrospective_replay',
        );
        expect(result.lookahead_safe).toBe(false);
        expect(result.predictive_claim_allowed).toBe(false);
        expect(result.overall_status).toBe('PASS');
        expect(result.results[0].status).toBe('PASS');
      },
    );

    it(
      'reports insufficient data rather than inventing a historical result',
      () => {
        const result = validateReplayWindows(
          [],
          {
            ...protocol,
            windows: [protocol.windows[0]],
          },
        );

        expect(result.results[0].status).toBe(
          'INSUFFICIENT_DATA',
        );
        expect(result.overall_status).toBe(
          'INSUFFICIENT_DATA',
        );
        expect(result.summary.pass_rate).toBe(null);
      },
    );

    it(
      'fails a predeclared directional hypothesis when replay moves the other way',
      () => {
        const window = protocol.windows[0];
        const result = validateReplayWindows(
          windowSnapshots(window, 70, 50),
          {
            ...protocol,
            windows: [window],
          },
        );

        expect(result.results[0].status).toBe('FAIL');
        expect(
          result.results[0].direction_match,
        ).toBe(false);
        expect(
          result.results[0].failure_reasons,
        ).toContain('direction_mismatch');
      },
    );

    it(
      'does not use arbitrarily distant snapshots to manufacture a result',
      () => {
        const window = protocol.windows[0];
        const eventMs = Date.parse(window.event_at);
        const result = validateReplayWindows(
          [
            snapshot(
              new Date(
                eventMs - 240 * 3_600_000,
              ).toISOString(),
              40,
            ),
            snapshot(
              new Date(
                eventMs + 240 * 3_600_000,
              ).toISOString(),
              70,
            ),
          ],
          {
            ...protocol,
            windows: [window],
          },
        );

        expect(result.results[0].status).toBe(
          'INSUFFICIENT_DATA',
        );
        expect(
          result.results[0].insufficiency_reasons,
        ).toEqual(
          expect.arrayContaining([
            'baseline_snapshot_missing_or_too_far',
            'evaluation_snapshot_missing_or_too_far',
          ]),
        );
      },
    );

    it(
      'treats missing coverage as insufficient even when the threshold is zero',
      () => {
        const window = protocol.windows[0];
        const rows = windowSnapshots(window);
        rows[0] = {
          ...rows[0],
          coverage: null,
        };

        const result = validateReplayWindows(
          rows,
          {
            ...protocol,
            windows: [
              {
                ...window,
                minimum_coverage: 0,
              },
            ],
          },
        );

        expect(result.results[0].status).toBe(
          'INSUFFICIENT_DATA',
        );
        expect(
          result.results[0].insufficiency_reasons,
        ).toContain('baseline_coverage_missing');
      },
    );

    it(
      'fails closed when the upstream proof envelope is not valid for the declared proof version',
      () => {
        const window = protocol.windows[0];
        const rows = windowSnapshots(window);
        rows[1] = {
          ...rows[1],
          proof_verified: true,
          proof_version: 'gri-proof-v0.0.0',
        };

        const result = validateReplayWindows(
          rows,
          {
            ...protocol,
            windows: [window],
          },
        );

        expect(result.results[0].status).toBe('FAIL');
        expect(result.results[0].proof_verified).toBe(false);
        expect(
          result.results[0].failure_reasons,
        ).toContain(
          'proof_envelope_invalid_or_unverified',
        );
      },
    );

    it(
      'rejects a protocol that tries to relabel this replay harness as lookahead-safe',
      () => {
        const window = protocol.windows[0];

        expect(() =>
          validateReplayWindows(
            windowSnapshots(window),
            {
              ...protocol,
              evidence_class:
                'prospective_lookahead_safe',
              lookahead_safe: true,
              windows: [window],
            },
          ),
        ).toThrow(
          'this validator only supports retrospective_replay evidence',
        );
      },
    );

    it(
      'rejects duplicate timestamps so input ordering cannot choose between conflicting snapshots',
      () => {
        const window = protocol.windows[0];
        const rows = windowSnapshots(window);
        rows.push({
          ...rows[0],
          raw_score: 99,
        });

        expect(() =>
          validateReplayWindows(
            rows,
            {
              ...protocol,
              windows: [window],
            },
          ),
        ).toThrow('duplicate snapshot timestamp');
      },
    );
  },
);
