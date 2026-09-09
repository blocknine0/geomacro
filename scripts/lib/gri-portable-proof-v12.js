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
  'gri-portable-proof-v1.1.0';

function isObject(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value),
  );
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function exactReproductionState(calculation) {
  return {
    methodologyVersion:
      calculation.methodologyVersion,
    asOf:
      calculation.asOf,
    rawScore:
      calculation.rawScore,
    displayScore:
      calculation.displayScore,
    coverage:
      calculation.coverage,
    weightedConfidence:
      calculation.weightedConfidence,
    eventCount:
      calculation.eventCount,
    sourceCount:
      calculation.sourceCount,
    independentStoryCount:
      calculation.independentStoryCount,
    categories:
      copy(calculation.categories ?? []),
    contributions:
      copy(calculation.contributions ?? []),
    inputRows:
      copy(calculation.inputRows ?? []),
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

function contributionResidual(calculation) {
  if (!isObject(calculation)) return null;
  if (calculation.rawScore === null) return null;
  const sum =
    (calculation.contributions ?? [])
      .reduce(
        (total, row) =>
          total + Number(
            row?.contributionPoints ?? 0,
          ),
        0,
      );
  return Number(calculation.rawScore) - sum;
}

function categoryResidual(calculation) {
  if (!isObject(calculation)) return null;
  if (calculation.rawScore === null) return null;
  const sum =
    (calculation.categories ?? [])
      .reduce(
        (total, row) =>
          total + Number(
            row?.contributionPoints ?? 0,
          ),
        0,
      );
  return Number(calculation.rawScore) - sum;
}

function eventChangeResidual(attribution) {
  if (!isObject(attribution)) return null;
  const sum =
    (attribution.eventChanges ?? [])
      .reduce(
        (total, row) =>
          total + Number(
            row?.deltaPoints ?? 0,
          ),
        0,
      );
  return Number(attribution.rawDelta) - sum;
}

function categoryChangeResidual(attribution) {
  if (!isObject(attribution)) return null;
  const sum =
    (attribution.categoryChanges ?? [])
      .reduce(
        (total, row) =>
          total + Number(
            row?.deltaPoints ?? 0,
          ),
        0,
      );
  return Number(attribution.rawDelta) - sum;
}

function exactEqual(left, right) {
  return canonicalJson(left) ===
    canonicalJson(right);
}

function manifestChecks(side) {
  const reproduction =
    side?.reproduction;

  if (!isObject(reproduction)) {
    return {
      input: false,
      evidence: false,
      calculation: false,
    };
  }

  return {
    input:
      exactEqual(
        inputManifest(reproduction),
        side.input,
      ),
    evidence:
      exactEqual(
        evidenceManifest(reproduction),
        side.evidence,
      ),
    calculation:
      exactEqual(
        calculationManifest(reproduction),
        side.calculation,
      ),
  };
}

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
      reproduction:
        exactReproductionState(
          currentCalculation,
        ),
      dispositions:
        canonicalDispositions,
    },
    previous:
      previousCalculation
        ? {
            input:
              inputManifest(
                previousCalculation,
              ),
            evidence:
              evidenceManifest(
                previousCalculation,
              ),
            calculation:
              calculationManifest(
                previousCalculation,
              ),
            reproduction:
              exactReproductionState(
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
        canonicalJson(
          bundleCore(bundle),
        ),
      ),
  };
}

export function verifyPortableGriProofBundle(
  bundle,
  {
    expectedProofHash = null,
  } = {},
) {
  if (!isObject(bundle)) {
    return {
      valid: false,
      internallyReproducible: false,
      authenticityAnchored: false,
      authenticAgainstExpectedHash: false,
      reasonCodes: ['malformed_bundle'],
      checks: {},
    };
  }

  const reasons = [];
  const current =
    isObject(bundle.current)
      ? bundle.current
      : null;
  const previous =
    isObject(bundle.previous)
      ? bundle.previous
      : null;
  const proof =
    isObject(bundle.proof)
      ? bundle.proof
      : null;

  const versionOk =
    bundle.bundleVersion ===
      GRI_PORTABLE_PROOF_BUNDLE_VERSION &&
    bundle.proofVersion ===
      GRI_PROOF_VERSION;

  const shapeOk = Boolean(
    current &&
      proof &&
      isObject(current.reproduction) &&
      isObject(current.calculation) &&
      Array.isArray(current.input) &&
      Array.isArray(current.evidence) &&
      Array.isArray(current.dispositions),
  );

  if (!versionOk || !shapeOk) {
    return {
      valid: false,
      internallyReproducible: false,
      authenticityAnchored:
        Boolean(expectedProofHash),
      authenticAgainstExpectedHash: false,
      reasonCodes: [
        ...(!versionOk
          ? ['unsupported_bundle_version']
          : []),
        ...(!shapeOk
          ? ['malformed_bundle']
          : []),
      ],
      checks: {
        version: versionOk,
        shape: shapeOk,
      },
    };
  }

  const currentManifest =
    manifestChecks(current);
  const previousManifest =
    previous
      ? manifestChecks(previous)
      : {
          input: true,
          evidence: true,
          calculation: true,
        };

  const currentReproduction =
    current.reproduction;
  const previousReproduction =
    previous?.reproduction ?? null;

  const recalculatedAttribution =
    previousReproduction
      ? attributeGriChange(
          previousReproduction,
          currentReproduction,
        )
      : null;

  const attributionMatches =
    exactEqual(
      recalculatedAttribution,
      bundle.attribution ?? null,
    );

  const contribution =
    contributionResidual(
      currentReproduction,
    );
  const category =
    categoryResidual(
      currentReproduction,
    );
  const eventDelta =
    recalculatedAttribution
      ? eventChangeResidual(
          recalculatedAttribution,
        )
      : null;
  const categoryDelta =
    recalculatedAttribution
      ? categoryChangeResidual(
          recalculatedAttribution,
        )
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
      canonicalJson(
        current.calculation,
      ),
    );
  const dispositionHashValue =
    dispositionHash(
      current.dispositions,
    );
  const changeHash =
    recalculatedAttribution
      ? sha256(
          canonicalJson(
            recalculatedAttribution,
          ),
        )
      : null;

  const expectedExplanation =
    buildDeterministicExplanation(
      currentReproduction,
      recalculatedAttribution,
      GRI_PROOF_VERSION,
    );

  const derivedProof =
    proofPayload({
      proofVersion:
        GRI_PROOF_VERSION,
      methodologyVersion:
        currentReproduction
          .methodologyVersion,
      asOf:
        currentReproduction.asOf,
      methodologyHash,
      inputHash,
      evidenceHash,
      calculationHash,
      dispositionHashValue,
      changeHash,
      reconciliationResidual:
        contribution,
      changeResidual:
        eventDelta,
      explanation:
        expectedExplanation,
    });

  const derivedProofHash =
    sha256(
      canonicalJson(derivedProof),
    );

  const proofFieldsMatch =
    proof.proofVersion ===
      derivedProof.proofVersion &&
    proof.methodologyVersion ===
      derivedProof.methodologyVersion &&
    proof.asOf ===
      derivedProof.asOf &&
    proof.methodologyHash ===
      derivedProof.methodologyHash &&
    proof.inputHash ===
      derivedProof.inputHash &&
    proof.evidenceHash ===
      derivedProof.evidenceHash &&
    proof.calculationHash ===
      derivedProof.calculationHash &&
    proof.dispositionHash ===
      derivedProof.dispositionHash &&
    (proof.changeHash ?? null) ===
      derivedProof.changeHash &&
    proof.reconciliationResidual ===
      derivedProof.reconciliationResidual &&
    proof.changeResidual ===
      derivedProof.changeResidual &&
    exactEqual(
      proof.explanation,
      derivedProof.explanation,
    ) &&
    proof.proofHash ===
      derivedProofHash;

  const bundleHash =
    sha256(
      canonicalJson(
        bundleCore(bundle),
      ),
    );

  const trustedHash =
    typeof expectedProofHash === 'string'
      ? expectedProofHash
          .trim()
          .toLowerCase()
      : null;
  const authenticityAnchored =
    Boolean(trustedHash);
  const authenticAgainstExpectedHash =
    Boolean(
      trustedHash &&
        /^[a-f0-9]{64}$/.test(
          trustedHash,
        ) &&
        trustedHash ===
          String(proof.proofHash ?? '')
            .toLowerCase(),
    );

  const checks = {
    version: versionOk,
    shape: shapeOk,
    currentInputManifest:
      currentManifest.input,
    currentEvidenceManifest:
      currentManifest.evidence,
    currentCalculationManifest:
      currentManifest.calculation,
    previousInputManifest:
      previousManifest.input,
    previousEvidenceManifest:
      previousManifest.evidence,
    previousCalculationManifest:
      previousManifest.calculation,
    methodologyHash:
      proof.methodologyHash ===
      methodologyHash,
    inputHash:
      proof.inputHash === inputHash,
    evidenceHash:
      proof.evidenceHash ===
      evidenceHash,
    calculationHash:
      proof.calculationHash ===
      calculationHash,
    dispositionHash:
      proof.dispositionHash ===
      dispositionHashValue,
    attribution:
      attributionMatches,
    changeHash:
      (proof.changeHash ?? null) ===
      changeHash,
    contributionReconciliation:
      reconcilesWithinTolerance(
        contribution,
      ),
    categoryReconciliation:
      reconcilesWithinTolerance(
        category,
      ),
    eventChangeReconciliation:
      reconcilesWithinTolerance(
        eventDelta,
      ),
    categoryChangeReconciliation:
      reconcilesWithinTolerance(
        categoryDelta,
      ),
    explanation:
      exactEqual(
        proof.explanation,
        expectedExplanation,
      ),
    proof:
      proofFieldsMatch,
    bundleHash:
      bundle.bundleHash ===
      bundleHash,
    expectedProofHash:
      authenticityAnchored
        ? authenticAgainstExpectedHash
        : null,
  };

  for (const [key, value] of
    Object.entries(checks)) {
    if (value === false) {
      reasons.push(`${key}_mismatch`);
    }
  }

  if (
    authenticityAnchored &&
    !authenticAgainstExpectedHash
  ) {
    reasons.push(
      'trusted_proof_hash_mismatch',
    );
  }

  const internallyReproducible =
    Object.entries(checks)
      .filter(
        ([key]) =>
          key !== 'expectedProofHash',
      )
      .every(
        ([, value]) =>
          value === true,
      );

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
      proofHash:
        derivedProofHash,
      bundleHash,
      contributionResidual:
        roundNumber(
          contribution,
          12,
        ),
      categoryResidual:
        roundNumber(
          category,
          12,
        ),
      eventChangeResidual:
        roundNumber(
          eventDelta,
          12,
        ),
      categoryChangeResidual:
        roundNumber(
          categoryDelta,
          12,
        ),
      tolerance:
        GRI_RECONCILIATION_TOLERANCE,
    },
  };
}
