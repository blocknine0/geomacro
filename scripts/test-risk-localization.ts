import {
  localizedDecisionLabel,
  normalizeRequestedLocale,
} from "../src/lib/risk-localization-contract";

const tests = [
  ["bn-BD", "REDUCE_LIMIT", "সীমা কমান"],
  ["hi-IN", "PAUSE", "रोकें"],
  ["fr-FR", "CONTINUE", "Continuer"],
  ["ja-JP", "BLOCK", "ブロック"],
  ["unknown", "CONTINUE", "Continue"],
] as const;

for (
  const [
    locale,
    decision,
    expected,
  ] of tests
) {
  const normalized =
    normalizeRequestedLocale(
      locale,
    );

  const actual =
    localizedDecisionLabel(
      decision,
      locale,
    );

  console.log({
    locale,
    normalized,
    decision,
    actual,
  });

  if (
    actual !== expected
  ) {
    throw new Error(
      `${locale}: expected ${expected}, got ${actual}`,
    );
  }
}

console.log(
  "PASS: multilingual decision localization clean",
);
