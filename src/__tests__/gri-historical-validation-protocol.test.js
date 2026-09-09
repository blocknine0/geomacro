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
) {
  return {
    as_of: asOf,
    raw_score: rawScore,
    display_score:
      Math.round(rawScore),
    coverage: 1,
    proof_verified: true,
  };
}

describe(
  'GRI historical validation protocol',
  () => {
    it(
      'never converts retrospective replay into a predictive-performance claim',
      () => {
        const window =
          protocol.windows[0];
        const eventMs =
          Date.parse(window.event_at);

        const result =
          validateReplayWindows(
            [
              snapshot(
                new Date(
                  eventMs - 80 * 3_600_000,
                ).toISOString(),
                40,
              ),
              snapshot(
                new Date(
                  eventMs + 80 * 3_600_000,
                ).toISOString(),
                65,
              ),
            ],
            {
              ...protocol,
              windows: [window],
            },
          );

        expect(
          result.evidence_class,
        ).toBe(
          'retrospective_replay',
        );
        expect(
          result.lookahead_safe,
        ).toBe(false);
        expect(
          result.predictive_claim_allowed,
        ).toBe(false);
        expect(
          result.results[0].status,
        ).toBe('PASS');
      },
    );

    it(
      'reports insufficient data rather than inventing a historical result',
      () => {
        const result =
          validateReplayWindows(
            [],
            {
              ...protocol,
              windows: [
                protocol.windows[0],
              ],
            },
          );

        expect(
          result.results[0].status,
        ).toBe(
          'INSUFFICIENT_DATA',
        );
        expect(
          result.summary.pass_rate,
        ).toBe(null);
      },
    );

    it(
      'fails a predeclared directional hypothesis when the replay moves the other way',
      () => {
        const window =
          protocol.windows[0];
        const eventMs =
          Date.parse(window.event_at);

        const result =
          validateReplayWindows(
            [
              snapshot(
                new Date(
                  eventMs - 80 * 3_600_000,
                ).toISOString(),
                70,
              ),
              snapshot(
                new Date(
                  eventMs + 80 * 3_600_000,
                ).toISOString(),
                50,
              ),
            ],
            {
              ...protocol,
              windows: [window],
            },
          );

        expect(
          result.results[0].status,
        ).toBe('FAIL');
        expect(
          result.results[0]
            .direction_match,
        ).toBe(false);
      },
    );
  },
);