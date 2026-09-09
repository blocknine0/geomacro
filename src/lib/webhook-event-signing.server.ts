import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as signBytes,
  verify as verifyBytes,
  type KeyObject,
} from "node:crypto";

import {
  canonicalJson,
} from "./canonical-json";
import {
  WEBHOOK_EVENT_CANONICALIZATION,
  WEBHOOK_EVENT_SIGNATURE_SCHEME,
  type RiskGateDecisionWebhookEvent,
} from "./webhook-event-contract";


export type WebhookSigningMaterial = {
  key_id: string;
  private_key_pkcs8_b64: string;
  public_key_spki_b64?: string;
};


const KEY_ID_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;


export function webhookOutboxEnabled():
  boolean {
  return (
    process.env
      .WEBHOOK_OUTBOX_ENABLED
      ?.trim()
      .toLowerCase() ===
    "true"
  );
}


function requiredKeyId(
  value: string,
): string {
  const normalized =
    value.trim();

  if (
    !KEY_ID_PATTERN.test(
      normalized,
    )
  ) {
    throw new Error(
      "Webhook signing key_id is invalid",
    );
  }

  return normalized;
}


function decodeCanonicalBase64(
  value: string,
  field: string,
): Buffer {
  const normalized =
    value.trim();

  if (
    !normalized ||
    normalized.length > 16384 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(
      normalized,
    )
  ) {
    throw new Error(
      `${field} must be canonical base64`,
    );
  }

  const decoded =
    Buffer.from(
      normalized,
      "base64",
    );

  if (
    decoded
      .toString("base64")
      .replace(/=+$/u, "") !==
    normalized.replace(/=+$/u, "")
  ) {
    throw new Error(
      `${field} must be canonical base64`,
    );
  }

  return decoded;
}


function requireEd25519(
  key: KeyObject,
  field: string,
): KeyObject {
  if (
    key.asymmetricKeyType !==
    "ed25519"
  ) {
    throw new Error(
      `${field} must be an Ed25519 key`,
    );
  }

  return key;
}


function privateKeyFromBase64(
  value: string,
): KeyObject {
  return requireEd25519(
    createPrivateKey({
      key:
        decodeCanonicalBase64(
          value,
          "Webhook private key",
        ),
      format: "der",
      type: "pkcs8",
    }),
    "Webhook private key",
  );
}


function publicKeyFromBase64(
  value: string,
): KeyObject {
  return requireEd25519(
    createPublicKey({
      key:
        decodeCanonicalBase64(
          value,
          "Webhook public key",
        ),
      format: "der",
      type: "spki",
    }),
    "Webhook public key",
  );
}


function publicKeyBase64(
  key: KeyObject,
): string {
  return Buffer.from(
    key.export({
      format: "der",
      type: "spki",
    }),
  ).toString("base64");
}


function signingMaterialFromEnv():
  WebhookSigningMaterial {
  const keyId =
    process.env
      .WEBHOOK_SIGNING_KEY_ID
      ?.trim();

  const privateKey =
    process.env
      .WEBHOOK_SIGNING_PRIVATE_KEY_PKCS8_B64
      ?.trim();

  if (!keyId || !privateKey) {
    throw new Error(
      "Webhook signing key is not configured",
    );
  }

  return {
    key_id:
      requiredKeyId(keyId),

    private_key_pkcs8_b64:
      privateKey,

    public_key_spki_b64:
      process.env
        .WEBHOOK_SIGNING_PUBLIC_KEY_SPKI_B64
        ?.trim() ||
      undefined,
  };
}


function signableEvent(
  event:
    RiskGateDecisionWebhookEvent,
): RiskGateDecisionWebhookEvent {
  return {
    ...event,

    integrity: {
      ...event.integrity,
      payload_hash: null,
      signature: null,
    },
  };
}


export function webhookEventPayloadHash(
  event:
    RiskGateDecisionWebhookEvent,
): string {
  return createHash("sha256")
    .update(
      canonicalJson(
        signableEvent(event),
      ),
      "utf8",
    )
    .digest("hex");
}


/**
 * Sign only the allowlisted structured webhook envelope. Webhook signing uses
 * a dedicated key namespace and never falls back to Risk Object signing keys.
 */
export function signWebhookEvent(
  event:
    RiskGateDecisionWebhookEvent,
  material:
    WebhookSigningMaterial =
      signingMaterialFromEnv(),
): RiskGateDecisionWebhookEvent {
  if (
    event.integrity
      .canonicalization !==
      WEBHOOK_EVENT_CANONICALIZATION ||
    event.integrity
      .signature_scheme !==
      WEBHOOK_EVENT_SIGNATURE_SCHEME
  ) {
    throw new Error(
      "Webhook event integrity contract is invalid",
    );
  }

  if (
    event.data
      .execution_authorized !==
    false
  ) {
    throw new Error(
      "Webhook event cannot authorize execution",
    );
  }

  const keyId =
    requiredKeyId(
      material.key_id,
    );

  const privateKey =
    privateKeyFromBase64(
      material
        .private_key_pkcs8_b64,
    );

  const derivedPublic =
    createPublicKey(
      privateKey,
    );

  if (
    material.public_key_spki_b64
  ) {
    const configured =
      publicKeyBase64(
        publicKeyFromBase64(
          material
            .public_key_spki_b64,
        ),
      );

    if (
      configured !==
      publicKeyBase64(
        derivedPublic,
      )
    ) {
      throw new Error(
        "Webhook signing private/public key mismatch",
      );
    }
  }

  const prepared:
    RiskGateDecisionWebhookEvent = {
      ...event,

      integrity: {
        ...event.integrity,
        payload_hash: null,
        signing_key_id:
          keyId,
        signature: null,
      },
    };

  const canonical =
    canonicalJson(
      signableEvent(prepared),
    );

  const payloadHash =
    createHash("sha256")
      .update(
        canonical,
        "utf8",
      )
      .digest("hex");

  const signature =
    signBytes(
      null,
      Buffer.from(
        canonical,
        "utf8",
      ),
      privateKey,
    ).toString("base64");

  const signed:
    RiskGateDecisionWebhookEvent = {
      ...prepared,

      integrity: {
        ...prepared.integrity,
        payload_hash:
          payloadHash,
        signature,
      },
    };

  if (
    !verifyWebhookEventSignature(
      signed,
      publicKeyBase64(
        derivedPublic,
      ),
    )
  ) {
    throw new Error(
      "Webhook signature self-verification failed",
    );
  }

  return signed;
}


export function verifyWebhookEventSignature(
  event:
    RiskGateDecisionWebhookEvent,
  publicKeySpkiB64: string,
): boolean {
  try {
    if (
      event.integrity
        .canonicalization !==
        WEBHOOK_EVENT_CANONICALIZATION ||
      event.integrity
        .signature_scheme !==
        WEBHOOK_EVENT_SIGNATURE_SCHEME ||
      !event.integrity
        .signing_key_id ||
      !event.integrity
        .payload_hash ||
      !event.integrity
        .signature ||
      event.data
        .execution_authorized !==
        false
    ) {
      return false;
    }

    const canonical =
      canonicalJson(
        signableEvent(event),
      );

    const expectedHash =
      createHash("sha256")
        .update(
          canonical,
          "utf8",
        )
        .digest("hex");

    if (
      expectedHash !==
      event.integrity
        .payload_hash
    ) {
      return false;
    }

    return verifyBytes(
      null,
      Buffer.from(
        canonical,
        "utf8",
      ),
      publicKeyFromBase64(
        publicKeySpkiB64,
      ),
      decodeCanonicalBase64(
        event.integrity
          .signature,
        "Webhook signature",
      ),
    );
  } catch {
    return false;
  }
}
