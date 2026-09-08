import {
  buildCorridorRiskObject,
  corridorSubjectId,
} from "./corridor-risk-engine";

import {
  signRiskObject,
  verifyRiskObjectSignature,
} from "./risk-object-signing.server";

import {
  getLatestCompatibleCountryRiskObjectAtOrBefore,
  getLatestCompatibleCorridorRiskObject,
  getRiskObjectByObjectId,
  persistRiskObject,
} from "./risk-object-store.server";

import type {
  GeomacroRiskObject,
} from "./risk-object-contract";


export type CorridorRiskPublishInput = {
  origin_country_iso3: string;
  destination_country_iso3: string;

  as_of?: string;
};


export type CorridorRiskPublishResult = {
  object:
    GeomacroRiskObject;

  context: {
    corridor_id: string;

    origin_country_iso3:
      string;

    destination_country_iso3:
      string;

    origin_risk_object_id:
      string;

    destination_risk_object_id:
      string;

    previous_object_id:
      string | null;

    published:
      boolean;
  };
};


function normalizeIso3(
  value: string,
  field: string,
) {
  const iso3 =
    value
      .trim()
      .toUpperCase();

  if (
    !/^[A-Z]{3}$/.test(
      iso3,
    )
  ) {
    throw new Error(
      `${field} must be ISO3`,
    );
  }

  return iso3;
}


async function
generateInternal(
  input:
    CorridorRiskPublishInput,

  publish:
    boolean,
): Promise<
  CorridorRiskPublishResult
> {
  const originIso3 =
    normalizeIso3(
      input.origin_country_iso3,
      "origin_country_iso3",
    );

  const destinationIso3 =
    normalizeIso3(
      input.destination_country_iso3,
      "destination_country_iso3",
    );

  const corridorId =
    corridorSubjectId(
      originIso3,
      destinationIso3,
    );

  const asOf =
    input.as_of
      ? new Date(
          input.as_of,
        )
      : new Date();

  if (
    Number.isNaN(
      asOf.getTime(),
    )
  ) {
    throw new Error(
      "Invalid as_of timestamp",
    );
  }

  const boundary =
    asOf.toISOString();

  const [
    origin,
    destination,
  ] =
    await Promise.all([
      getLatestCompatibleCountryRiskObjectAtOrBefore(
        originIso3,
        boundary,
      ),

      getLatestCompatibleCountryRiskObjectAtOrBefore(
        destinationIso3,
        boundary,
      ),
    ]);

  if (!origin) {
    throw new Error(
      `No compatible origin country GRO found for ${originIso3}`,
    );
  }

  if (!destination) {
    throw new Error(
      `No compatible destination country GRO found for ${destinationIso3}`,
    );
  }

  const originSignature =
    verifyRiskObjectSignature(
      origin,
    );

  if (
    !originSignature.valid
  ) {
    throw new Error(
      `Origin GRO signature verification failed: ${originSignature.reason}`,
    );
  }

  const destinationSignature =
    verifyRiskObjectSignature(
      destination,
    );

  if (
    !destinationSignature.valid
  ) {
    throw new Error(
      `Destination GRO signature verification failed: ${destinationSignature.reason}`,
    );
  }

  const previous =
    await getLatestCompatibleCorridorRiskObject(
      corridorId,
      boundary,
    );

  const unsignedObject =
    await buildCorridorRiskObject({
      origin_country_iso3:
        originIso3,

      destination_country_iso3:
        destinationIso3,

      origin,

      destination,

      previous,

      as_of:
        boundary,
    });

  const object =
    publish
      ? signRiskObject(
          unsignedObject,
        )
      : unsignedObject;

  if (publish) {
    await persistRiskObject(
      object,
    );

    const readBack =
      await getRiskObjectByObjectId(
        object.object_id,
      );

    if (!readBack) {
      throw new Error(
        "Published corridor GRO could not be read back",
      );
    }

    if (
      readBack
        .integrity
        .calculation_hash !==
      object
        .integrity
        .calculation_hash
    ) {
      throw new Error(
        "Published corridor GRO calculation hash mismatch",
      );
    }

    if (
      readBack.subject.type !==
        "corridor" ||
      readBack.subject.id !==
        corridorId
    ) {
      throw new Error(
        "Published corridor GRO subject mismatch",
      );
    }

    const signatureCheck =
      verifyRiskObjectSignature(
        readBack,
      );

    if (
      !signatureCheck.valid
    ) {
      throw new Error(
        `Published corridor GRO signature verification failed: ${signatureCheck.reason}`,
      );
    }
  }

  return {
    object,

    context: {
      corridor_id:
        corridorId,

      origin_country_iso3:
        originIso3,

      destination_country_iso3:
        destinationIso3,

      origin_risk_object_id:
        origin.object_id,

      destination_risk_object_id:
        destination.object_id,

      previous_object_id:
        previous?.object_id ??
        null,

      published:
        publish,
    },
  };
}


export async function
dryRunCorridorRiskObject(
  input:
    CorridorRiskPublishInput,
) {
  return await generateInternal(
    input,
    false,
  );
}


export async function
publishCorridorRiskObject(
  input:
    CorridorRiskPublishInput,
) {
  return await generateInternal(
    input,
    true,
  );
}
