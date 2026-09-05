export const RISK_LOCALIZATION_VERSION =
  "risk-localization-v1.0.0" as const;

/**
 * Localization is presentation only.
 *
 * These fields MUST NEVER modify:
 * - risk score
 * - risk decision
 * - evidence identity
 * - policy
 * - methodology version
 * - calculation hash
 * - audit state
 */
export type RiskLocaleRequest = {
  requested_locale?: string | null;
};

export type RiskLocalizedContent = {
  version:
    typeof RISK_LOCALIZATION_VERSION;

  locale:
    string;

  decision_label:
    string;

  risk_label:
    string | null;

  summary:
    string | null;

  driver_labels:
    Record<
      string,
      string
    >;

  reason_labels:
    Record<
      string,
      string
    >;

  canonical_content_hash:
    string;

  localized_content_hash:
    string;

  translation_provider:
    string;

  translation_model:
    string | null;

  translated_at:
    string;
};

const DECISION_LABELS:
  Record<
    string,
    Record<string, string>
  > = {
    en: {
      CONTINUE:
        "Continue",
      REDUCE_LIMIT:
        "Reduce limit",
      REQUIRE_APPROVAL:
        "Require approval",
      PAUSE:
        "Pause",
      BLOCK:
        "Block",
    },

    bn: {
      CONTINUE:
        "চালিয়ে যান",
      REDUCE_LIMIT:
        "সীমা কমান",
      REQUIRE_APPROVAL:
        "অনুমোদন নিন",
      PAUSE:
        "সাময়িকভাবে থামান",
      BLOCK:
        "ব্লক করুন",
    },

    hi: {
      CONTINUE:
        "जारी रखें",
      REDUCE_LIMIT:
        "सीमा कम करें",
      REQUIRE_APPROVAL:
        "अनुमोदन आवश्यक",
      PAUSE:
        "रोकें",
      BLOCK:
        "ब्लॉक करें",
    },

    es: {
      CONTINUE:
        "Continuar",
      REDUCE_LIMIT:
        "Reducir límite",
      REQUIRE_APPROVAL:
        "Requiere aprobación",
      PAUSE:
        "Pausar",
      BLOCK:
        "Bloquear",
    },

    fr: {
      CONTINUE:
        "Continuer",
      REDUCE_LIMIT:
        "Réduire la limite",
      REQUIRE_APPROVAL:
        "Approbation requise",
      PAUSE:
        "Suspendre",
      BLOCK:
        "Bloquer",
    },

    de: {
      CONTINUE:
        "Fortfahren",
      REDUCE_LIMIT:
        "Limit reduzieren",
      REQUIRE_APPROVAL:
        "Genehmigung erforderlich",
      PAUSE:
        "Pausieren",
      BLOCK:
        "Blockieren",
    },

    ar: {
      CONTINUE:
        "متابعة",
      REDUCE_LIMIT:
        "خفض الحد",
      REQUIRE_APPROVAL:
        "يتطلب موافقة",
      PAUSE:
        "إيقاف مؤقت",
      BLOCK:
        "حظر",
    },

    ja: {
      CONTINUE:
        "続行",
      REDUCE_LIMIT:
        "上限を引き下げる",
      REQUIRE_APPROVAL:
        "承認が必要",
      PAUSE:
        "一時停止",
      BLOCK:
        "ブロック",
    },
  };

export function
normalizeRequestedLocale(
  value:
    string | null | undefined,
) {
  const raw =
    value
      ?.trim()
      .toLowerCase();

  if (!raw) {
    return "en";
  }

  const language =
    raw.split(
      /[-_]/,
    )[0];

  if (
    DECISION_LABELS[
      language
    ]
  ) {
    return language;
  }

  return "en";
}

export function
localizedDecisionLabel(
  decision:
    string,
  locale:
    string | null | undefined,
) {
  const normalized =
    normalizeRequestedLocale(
      locale,
    );

  return (
    DECISION_LABELS[
      normalized
    ]?.[decision] ??
    DECISION_LABELS.en[
      decision
    ] ??
    decision
  );
}
