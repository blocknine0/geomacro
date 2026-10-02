export const GRI_PR_CALIBRATION_FIXTURE_VERSION = "gri-pr-calibration-fixture-v1.0.0";
export const GRI_PR_CALIBRATION_FIXTURE_CAPTURED_AT = "2026-10-02T07:20:00.000Z";

export const GRI_PR_SENSITIVITY_SNAPSHOT = Object.freeze({
  id: "d29281aa-b4df-4b55-8207-581cccfb88a0",
  as_of: "2026-10-01T16:30:47.667+00:00",
  methodology_version: "gri-v1.2.0",
  proof_version: "gri-proof-v1.2.0",
  proof_hash: "c32e51690325715effefeb54adc81673818b2c9c3ba7bee4f9d82993b0662981",
  verification_status: "verified",
  status: "published",
  raw_score: 67.845172,
  display_score: 68,
  coverage: 1,
  event_count: 21,
  source_count: 12,
  independent_story_count: 20,
  published_at: "2026-10-01T16:31:08.988+00:00",
});

const CONTRIBUTION_TUPLES = [
  ["0bb0588a-5b22-41cd-9635-57cb34acc7b8","rare_earth","finanznachrichten.de",70,80,"2026-10-01T16:29:53.544+00:00","5863f30b-3b68-4202-a016-71a691f0cc95"],
  ["21fa5963-b673-40e2-95bb-12a52a1bb94d","geopolitics","theguardian.com",70,80,"2026-10-01T08:19:14.003+00:00","1e1bca7c-c85b-44c1-b040-b3fc1cafd9c2"],
  ["249f67e5-4e18-4c78-9489-9958dbe5f9d2","macro","vneconomy.vn",70,80,"2026-10-01T08:19:50.871+00:00","c6818968-e4ad-4c71-a565-9b3796a5b539"],
  ["32bbf400-78d5-40c0-9e34-70dfa7ac7028","macro","theguardian.com",65,75,"2026-09-29T02:21:36.833+00:00","f9ae51d4-f685-4c9a-bf3e-293a47697fd3"],
  ["362e4b4d-68f2-40cc-860a-d7dec3ccb30e","geopolitics","theguardian.com",70,80,"2026-09-29T21:35:09.669+00:00","0687a0df-e3e2-4f24-af9c-4eceffd2b98b"],
  ["44c76838-d984-43be-84b5-2fb0d236c77e","macro","vietgiaitri.com",60,70,"2026-10-01T08:23:26.584+00:00","78fc975d-64f0-4677-a7fa-6796605ffb80"],
  ["457a7437-84ed-4435-bd9f-135f040b8ca7","geopolitics","theguardian.com",70,80,"2026-09-30T07:37:12.708+00:00","d857d9f9-a975-42da-8b3b-ff8af4c42383"],
  ["4946932b-ce37-4d85-bbbe-d7fdaa0257f2","macro","theguardian.com",70,80,"2026-09-30T00:51:56.528+00:00","cdaa6b7e-a9a2-49af-8352-f44089503ddc"],
  ["61c6f044-1d76-4367-b053-5b9dfcffb6c4","rare_earth","punchng.com",70,80,"2026-10-01T16:29:47.185+00:00","4afad97a-4fe7-4198-aab7-b95991e57e5b"],
  ["6ddf2869-22ba-40d8-a592-34ffa8fb4eb9","macro","theguardian.com",70,80,"2026-10-01T13:25:23.059+00:00","15820662-642b-4d8e-b17f-5f0568a93363"],
  ["70aed05c-f33b-4199-9c87-129d7511b57e","rare_earth","juniorminingnetwork.com",65,75,"2026-10-01T16:29:54.4+00:00","82a54727-6f2f-4ed1-8b73-fdf3e558453d"],
  ["70d3b61f-90e6-4ca6-85cd-9888d342cb1b","macro","theguardian.com",60,75,"2026-10-01T13:25:23.33+00:00","02e883e2-ce61-4209-9b41-37f0468f42bc"],
  ["86fa1c5f-bbe8-442b-a58a-e2267d0e14a6","macro","economictimes.indiatimes.com",75,85,"2026-09-29T21:35:35.259+00:00","2b052bef-a244-41a5-aa4e-4b00dc2971e5"],
  ["a2a9c652-906a-4eff-80c5-84cddf2ea5bc","rare_earth","aol.com",65,75,"2026-10-01T16:29:48.045+00:00","0f60ee88-3c25-4a77-a4a5-bab39ececbb8"],
  ["bd145dbf-2e64-4d4e-97fb-91a6b0d2d05f","macro","kurier.at",70,80,"2026-09-29T21:35:34.407+00:00","3894b222-21f3-4f2f-bf49-59720272667b"],
  ["c5b2571f-fcfd-4f27-b938-087ff73077d8","rare_earth","shanghainews.net",70,80,"2026-09-29T02:43:09.169+00:00","d1043ac3-081b-4b8d-a29c-e928541dc5ba"],
  ["d57b0712-ac0e-4f57-9450-d8cc880977f7","geopolitics","theguardian.com",70,80,"2026-10-01T08:23:01.976+00:00","1b534c0d-615b-49ae-9b5b-1b7bf8d52539"],
  ["d60738d4-ddbc-4670-af82-b87235d64519","macro","en.apa.az",65,75,"2026-10-01T08:19:56.209+00:00","930f8622-c2fb-4554-ab33-51fe7afc51dc"],
  ["e474c05d-7cc3-43fe-85d0-3e81b8d846b7","macro","english.news.cn",65,75,"2026-10-01T08:23:25.73+00:00","930f8622-c2fb-4554-ab33-51fe7afc51dc"],
  ["e798e1c4-e34e-4b7d-a1d8-82abac2f01ab","macro","theguardian.com",75,85,"2026-09-30T00:51:56.816+00:00","f892a08d-0158-49a2-99b4-636cc6ee3fb8"],
  ["fda00db9-efdc-484f-8e55-095756694ed2","macro","economictimes.indiatimes.com",60,70,"2026-10-01T08:36:25.125+00:00","4c42111d-6d38-4645-b2a7-e95859ae9e0f"]
];

export const GRI_PR_SENSITIVITY_CONTRIBUTIONS = Object.freeze(
  CONTRIBUTION_TUPLES.map(
    ([event_id, category, source_key, severity, confidence, observed_at, story_cluster_id]) =>
      Object.freeze({event_id,category,source_key,severity,confidence,observed_at,story_cluster_id}),
  ),
);

const VALIDATION_BENCHMARKS = Object.freeze(["broad_usd","gold","sp500","us30y","vix","wti"]);
const VALIDATION_HORIZONS = Object.freeze([24,72,168]);
const VALIDATION_SPLITS = Object.freeze(["all","train","test"]);
const DIRECTIONAL_BENCHMARKS = new Set(["sp500","vix"]);
const NOTE_DIRECTIONAL = "Correlation p-values are approximate Fisher-z diagnostics. Event-study z values are standardized within this benchmark/horizon/split.";
const NOTE_NO_DIRECTION = "Direction/event-study metrics intentionally omitted because no fixed risk direction is asserted for this benchmark. Correlation p-values are approximate Fisher-z diagnostics, not standalone proof.";

export const GRI_PR_VALIDATION_RUN = Object.freeze({
  id: "ce2679d0-e0fb-4e6a-8b5e-fec5d8669f32",
  methodology_version: "gri-v1.2.0",
  validation_version: "gri-validation-v1.1.0",
  evidence_mode: "live_oos",
  source_replay_run_id: null,
  status: "insufficient_data",
  sample_start: null,
  sample_end: null,
  sample_count: 0,
  benchmark_count: 6,
  train_fraction: 0.7,
  result_hash: "6f3d3ac6a55daba887da41ab572c7a0095c9f70fb243087e4d009bb6e9eccaa6",
  summary: Object.freeze({
    purpose: "Empirical validation of association, standardized event-study response and forward relationships. Results do not establish causality or guarantee prediction.",
    claimPolicy: "Insufficient data: do not publish performance claims.",
    evidenceMode: "live_oos",
    evidenceNote: "True live published snapshots only.",
    benchmarkKeys: [...VALIDATION_BENCHMARKS],
    horizonsHours: [...VALIDATION_HORIZONS],
    trainFraction: 0.7,
    minimumSamples: Object.freeze({all:30,test:10}),
    highRiskThreshold: 75,
    sourceReplayRunId: null,
    validationVersion: "gri-validation-v1.1.0",
    methodologyVersion: "gri-v1.2.0",
    maxAvailablePairCount: 0,
  }),
  published_at: "2026-09-07T16:58:05.812+00:00",
});

export const GRI_PR_VALIDATION_METRICS = Object.freeze(
  VALIDATION_BENCHMARKS.flatMap((benchmark_key) =>
    VALIDATION_HORIZONS.flatMap((horizon_hours) =>
      VALIDATION_SPLITS.map((split) => Object.freeze({
        benchmark_key,
        horizon_hours,
        split,
        sample_count: 0,
        pearson_r: null,
        spearman_rho: null,
        delta_pearson_r: null,
        delta_pearson_p_approx: null,
        direction_hit_rate: null,
        high_risk_event_count: 0,
        false_positive_rate: null,
        event_study_high_mean_z: null,
        event_study_baseline_mean_z: null,
        event_study_effect_z: null,
        notes: DIRECTIONAL_BENCHMARKS.has(benchmark_key) ? NOTE_DIRECTIONAL : NOTE_NO_DIRECTION,
      })),
    ),
  ),
);
