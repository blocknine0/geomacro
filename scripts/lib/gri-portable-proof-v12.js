import {
  attributeGriChange,
  canonicalJson,
  methodologyManifest,
} from './gri-engine-v12.js';

import {
  GRI_PROOF_VERSION,
  GRI_RECONCILIATION_TOLERANCE,
  buildDeterministicExplanation,
  buildProofArtifacts,
  calculationManifest,
  evidenceManifest,
  inputManifest,
  reconcilesWithinTolerance,
  roundNumber,
  sha256,
} from './gri-proof-v12.js';

import {
  dispositionHash,
  dispositionManifest,
} from './gri-disposition-v12.js';

export const GRI_PORTABLE_PROOF_BUNDLE_VERSION =
  'gri-portable-proof-v1.0.0';

function isObject(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value),
  );
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number
    : null;
}

function closeEnough(a, b, tolerance = GRI_RECONCILIATION_TOLERANCE) {
  const left = finite(a);
  const right = finite(b);
  if (left === null || right === null) return false;
  return Math.abs(left - right) <= tolerance;
}

function calculationWithEvidence(calculation, evidence) {
  if (!isObject(calculation)) return null;

  const evidenceById = new Map(
    Array.isArray(evidence)
      ? evidence.map((row) => [String(row?.eventId ?? ''), row])
      : [],
  );

  return {
    ...calculation,
    categories: Array.isArray(calculation.categories)
      ? calculation.categories
      : [],
    contributions: Array.isArray(calculation.contributions)
      ? calculation.contributions.map((row) => {
          const evidenceRow = evidenceById.get(
            String(row?.eventId ?? ''),
          );

          return {
            ...row,
            sourceTitle:
              evidenceRow?.sourceTitle ?? null,
            sourceUrl:
              evidenceRow?.sourceUrl ?? null,
            storyCanonicalLabel:
              evidenceRow?.storyCanonicalLabel ?? null,
          };
        })
      : [],
  };
}

function proofPayload({
  proofVersion,
  methodologyVersion,
  asOf,
  methodologyHash,
  inputHash,
  evidenceHash,
  calculationHash,
  dispositionHashValue,
  changeHash,
  reconciliationResidual,
  changeResidual,
  explanation,
}) {
  return {
    proofVersion,
    methodologyVersion,
    asOf,
    methodologyHash,
    inputHash,
    evidenceHash,
    calculationHash,
    dispositionHash:
      dispositionHashValue,
    changeHash,
    reconciliationResidual:
      roundNumber(
        reconciliationResidual,
        12,
      ),
    changeResidual:
      roundNumber(
        changeResidual,
        12,
      ),
    explanation,
  };
}

function bundleCore(bundle) {
  return {
    bundleVersion: bundle.bundleVersion,
    proofVersion: bundle.proofVersion,
    methodologyVersion:
      bundle.methodologyVersion,
    asOf: bundle.asOf,
    methodology: bundle.methodology,
    current: bundle.current,
    previous: bundle.previous,
    attribution: bundle.attribution,
    proof: bundle.proof,
  };
}

/**
 * Build a portable, structured-only GRI proof package.
 *
 * The bundle contains no provider-private/raw warehouse payload. It includes
 * the canonical calculation/evidence/input/disposition manifests required to
 * reproduce the published v1.2 proof hashes and mathematical attribution.
 */
export function buildPortableGriProofBundle({
  currentCalculation,
  previousCalculation = null,
  dispositions,
}) {
  if (!isObject(currentCalculation)) {
    throw new Error(
      'Portable GRI proof requires currentCalculation',
    );
  }

  const canonicalDispositions =
    dispositionManifest(dispositions ?? []);

  const dispositionHashValue =
    dispositionHash(canonicalDispositions);

  const attribution =
    previousCalculation
      ? attributeGriChange(
          previousCalculation,
          currentCalculation,
        )
      : null;

  const proof =
    buildProofArtifacts(
      currentCalculation,
      attribution,
      {
        proofVersion:
          GRI_PROOF_VERSION,
        dispositionHash:
          dispositionHashValue,
      },
    );

  if (!proof.verified) {
    throw new Error(
      'GRI calculation/change residual does not reconcile',
    );
  }

  const bundle = {
    bundleVersion:
      GRI_PORTABLE_PROOF_BUNDLE_VERSION,
    proofVersion:
      GRI_PROOF_VERSION,
    methodologyVersion:
      currentCalculation.methodologyVersion,
    asOf:
      currentCalculation.asOf,

    methodology:
      methodologyManifest(),

    current: {
      input:
        inputManifest(currentCalculation),
      evidence:
        evidenceManifest(currentCalculation),
      calculation:
        calculationManifest(
          currentCalculation,
        ),
      dispositions:
        canonicalDispositions,
    },

    previous:
      previousCalculation
        ? {
            calculation:
              calculationManifest(
                previousCalculation,
              ),
            evidence:
              evidenceManifest(
                previousCalculation,
              ),
          }
        : null,

    attribution,
    proof,
  };

  return {
    ...bundle,
    bundleHash:
      sha256(
        canonicalJson(bundleCore(bundle)),
      ),
  };
}

function compareAttribution(
  expected,
  actual,
) {
  if (expected === null || actual === null) {
    return expected === actual;
  }

  return canonicalJson(expected) ===
    canonicalJson(actual);
}

function contributionResidual(calculation) {
  if (!isObject(calculation)) return null;
  const rawScore = finite(calculation.rawScore);
  if (rawScore === null) return null;

  const rows =
    Array.isArray(calculation.contributions)
      ? calculation.contributions
      : [];

  const sum = rows.reduce(
    (total, row) =>
      total + Number(row?.contributionPoints ?? 0),
    0,
  );

  return rawScore - sum;
}

function categoryResidual(calculation) {
  if (!isObject(calculation)) return null;
  const rawScore = finite(calculation.rawScore);
  if (rawScore === null) return null;

  const rows =
    Array.isArray(calculation.categories)
      ? calculation.categories
      : [];

  const sum = rows.reduce(
    (total, row) =>
      total + Number(row?.contributionPoints ?? 0),
    0,
  );

  return rawScore - sum;
}

function changeResidual(attribution) {
  if (!isObject(attribution)) return null;
  const rawDelta = finite(attribution.rawDelta);
  if (rawDelta === null) return null;

  const rows =
    Array.isArray(attribution.eventChanges)
      ? attribution.eventChanges
      : [];

  const sum = rows.reduce(
    (total, row) =>
      total + Number(row?.deltaPoints ?? 0),
    0,
  );

  return rawDelta - sum;
}

function categoryChangeResidual(attribution) {
  if (!isObject(attribution)) return null;
  const rawDelta = finite(attribution.rawDelta);
  if (rawDelta === null) return null;

  const rows =
    Array.isArray(attribution.categoryChanges)
      ? attribution.categoryChanges
      : [];

  const sum = rows.reduce(
    (total, row) =>
      total + Number(row?.deltaPoints ?? 0),
    0,
  );

  return rawDelta - sum;
}

/**
 * Verify a portable GRI bundle without a database, network, secret or model.
 *
 * `expectedProofHash` is optional but strongly recommended for third-party
 * authenticity. Without an independently obtained trusted proof hash, this
 * verifier proves internal reproducibility/integrity, not issuer authenticity.
 */
export function verifyPortableGriProofBundle(
  bundle,
  {
    expectedProofHash = null,
  } = {},
) {
  const reasons = [];

  if (!isObject(bundle)) {
    return {
      valid: false,
      internallyReproducible: false,
      authenticityAnchored: false,
      authenticAgainstExpectedHash: false,
      reasonCodes: [
        'malformed_bundle',
      ],
      checks: {},
    };
  }

  const versionOk =
    bundle.bundleVersion ===
      GRI_PORTABLE_PROOF_BUNDLE_VERSION &&
    bundle.proofVersion ===
      GRI_PROOF_VERSION;

  const current =
    isObject(bundle.current)
      ? bundle.current
      : null;
  const proof =
    isObject(bundle.proof)
      ? bundle.proof
      : null;

  const shapeOk = Boolean(
    current &&
      proof &&
      isObject(current.calculation) &&
      Array.isArray(current.input) &&
      Array.isArray(current.evidence) &&
      Array.isArray(current.dispositions),
  );

  if (!versionOk) {
    reasons.push('unsupported_bundle_version');
  }
  if (!shapeOk) {
    reasons.push('malformed_bundle');
  }

  if (!versionOk || !shapeOk) {
    return {
      valid: false,
      internallyReproducible: false,
      authenticityAnchored:
        Boolean(expectedProofHash),
      authenticAgainstExpectedHash: false,
      reasonCodes:
        Array.from(new Set(reasons)),
      checks: {
        version: versionOk,
        shape: shapeOk,
      },
    };
  }

  const currentCalculation =
    current.calculation;
  const previous =
    isObject(bundle.previous)
      ? bundle.previous
      : null;

  const methodologyHash =
    sha256(
      canonicalJson(bundle.methodology),
    );
  const inputHash =
    sha256(
      canonicalJson(current.input),
    );
  const evidenceHash =
    sha256(
      canonicalJson(current.evidence),
    );
  const calculationHash =
    sha256(
      canonicalJson(currentCalculation),
    );
  const dispositionHashValue =
    dispositionHash(
      current.dispositions,
    );
  const changeHash =
    bundle.attribution
      ? sha256(
          canonicalJson(bundle.attribution),
        )
      : null;

  const currentForAttribution =
    calculationWithEvidence(
      currentCalculation,
      current.evidence,
    );
  const previousForAttribution =
    previous
      ? calculationWithEvidence(
          previous.calculation,
          previous.evidence,
        )
      : null;

  const recalculatedAttribution =
    previousForAttribution
      ? attributeGriChange(
          previousForAttribution,
          currentForAttribution,
        )
      : null;

  const attributionMatches =
    compareAttribution(
      recalculatedAttribution,
      bundle.attribution ?? null,
    );

  const currentContributionResidual =
    contributionResidual(
      currentCalculation,
    );
  const currentCategoryResidual =
    categoryResidual(
      currentCalculation,
    );
  const eventChangeResidual =
    bundle.attribution
      ? changeResidual(bundle.attribution)
      : null;
  const categoryDeltaResidual =
    bundle.attribution
      ? categoryChangeResidual(
          bundle.attribution,
        )
      : null;

  const contributionReconciles =
    reconcilesWithinTolerance(
      currentContributionResidual,
    );
  const categoryReconciles =
    reconcilesWithinTolerance(
      currentCategoryResidual,
    );
  const eventChangeReconciles =
    reconcilesWithinTolerance(
      eventChangeResidual,
    );
  const categoryChangeReconciles =
    reconcilesWithinTolerance(
      categoryDeltaResidual,
    );

  const expectedExplanation =
    buildDeterministicExplanation(
      currentForAttribution,
      recalculatedAttribution,
      GRI_PROOF_VERSION,
    );
  const explanationMatches =
    canonicalJson(expectedExplanation) ===
      canonicalJson(proof.explanation);

  const derivedProofPayload =
    proofPayload({
      proofVersion:
        GRI_PROOF_VERSION,
      methodologyVersion:
        currentCalculation.methodologyVersion,
      asOf:
        currentCalculation.asOf,
      methodologyHash,
      inputHash,
      evidenceHash,
      calculationHash,
      dispositionHashValue,
      changeHash,
      reconciliationResidual:
        currentContributionResidual,
      changeResidual:
        eventChangeResidual,
      explanation:
        expectedExplanation,
    });

  const proofHash =
    sha256(
      canonicalJson(derivedProofPayload),
    );

  const proofFieldsMatch =
    proof.proofVersion ===
      GRI_PROOF_VERSION &&
    proof.methodologyVersion ===
      currentCalculation.methodologyVersion &&
    proof.asOf ===
      currentCalculation.asOf &&
    proof.methodologyHash ===
      methodologyHash &&
    proof.inputHash === inputHash &&
    proof.evidenceHash === evidenceHash &&
    proof.calculationHash ===
      calculationHash &&
    proof.dispositionHash ===
      dispositionHashValue &&
    (proof.changeHash ?? null) ===
      changeHash &&
    closeEnough(
      proof.reconciliationResidual,
      currentContributionResidual ?? 0,
      1e-12,
    ) &&
    (
      eventChangeResidual === null
        ? proof.changeResidual === null
        : closeEnough(
            proof.changeResidual,
            eventChangeResidual,
            1e-12,
          )
    ) &&
    proof.proofHash === proofHash;

  const bundleHash =
    sha256(
      canonicalJson(bundleCore(bundle)),
    );
  const bundleHashMatches =
    bundle.bundleHash === bundleHash;

  const expectedHashNormalized =
    typeof expectedProofHash === 'string'
      ? expectedProofHash
          .trim()
          .toLowerCase()
      : null;
  const authenticityAnchored =
    Boolean(expectedHashNormalized);
  const authenticAgainstExpectedHash =
    authenticityAnchored &&
    /^[a-f0-9]{64}$/.test(
      expectedHashNormalized,
    ) &&
    expectedHashNormalized ===
      String(proof.proofHash ?? '')
        .toLowerCase();

  const checks = {
    version: versionOk,
    shape: shapeOk,
    methodologyHash:
      proof.methodologyHash ===
      methodologyHash,
    inputHash:
      proof.inputHash === inputHash,
    evidenceHash:
      proof.evidenceHash === evidenceHash,
    calculationHash:
      proof.calculationHash ===
      calculationHash,
    dispositionHash:
      proof.dispositionHash ===
      dispositionHashValue,
    changeHash:
      (proof.changeHash ?? null) ===
      changeHash,
    contributionReconciliation:
      contributionReconciles,
    categoryReconciliation:
      categoryReconciles,
    eventChangeReconciliation:
      eventChangeReconciles,
    categoryChangeReconciliation:
      categoryChangeReconciles,
    attribution:
      attributionMatches,
    explanation:
      explanationMatches,
    proof:
      proofFieldsMatch,
    bundleHash:
      bundleHashMatches,
    expectedProofHash:
      authenticityAnchored
        ? authenticAgainstExpectedHash
        : null,
  };

  for (const [key, passed] of
    Object.entries(checks)) {
    if (passed === false) {
      reasons.push(`${key}_mismatch`);
    }
  }

  const internallyReproducible =
    Object.entries(checks)
      .filter(
        ([key]) =>
          key !== 'expectedProofHash',
      )
      .every(([, passed]) =>
        passed === true,
      );

  if (
    authenticityAnchored &&
    !authenticAgainstExpectedHash
  ) {
    reasons.push(
      'trusted_proof_hash_mismatch',
    );
  }

  return {
    valid:
      internallyReproducible &&
      (
        !authenticityAnchored ||
        authenticAgainstExpectedHash
      ),
    internallyReproducible,
    authenticityAnchored,
    authenticAgainstExpectedHash,
    reasonCodes:
      Array.from(new Set(reasons)),
    checks,
    recomputed: {
      methodologyHash,
      inputHash,
      evidenceHash,
      calculationHash,
      dispositionHash:
        dispositionHashValue,
      changeHash,
      proofHash,
      bundleHash,
      contributionResidual:
        roundNumber(
          currentContributionResidual,
          12,
        ),
      categoryResidual:
        roundNumber(
          currentCategoryResidual,
          12,
        ),
      eventChangeResidual:
        roundNumber(
          eventChangeResidual,
          12,
        ),
      categoryChangeResidual:
        roundNumber(
          categoryDeltaResidual,
          12,
        ),
    },
  };
}
