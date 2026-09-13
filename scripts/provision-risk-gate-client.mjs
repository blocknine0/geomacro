import {
  createHmac,
  randomBytes,
} from "node:crypto";

import {
  createClient,
} from "@supabase/supabase-js";


const [
  ,
  ,
  clientIdRaw,
  displayNameRaw,
  limitRaw,
] =
  process.argv;


const clientId =
  clientIdRaw?.trim();

const displayName =
  displayNameRaw?.trim();

const requestsPerMinute =
  limitRaw
    ? Number(limitRaw)
    : 60;


if (
  !clientId ||
  !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/
    .test(clientId)
) {
  throw new Error(
    "Usage: node scripts/provision-risk-gate-client.mjs <client-id> <display-name> [requests-per-minute]",
  );
}


if (!displayName) {
  throw new Error(
    "display-name is required",
  );
}


if (
  !Number.isInteger(
    requestsPerMinute,
  ) ||
  requestsPerMinute < 1 ||
  requestsPerMinute > 10000
) {
  throw new Error(
    "requests-per-minute must be an integer from 1 to 10000",
  );
}


const url =
  process.env.SUPABASE_URL?.trim() ||
  process.env.APP_SUPABASE_URL?.trim();


const serviceKey =
  process.env
    .SUPABASE_SERVICE_ROLE_KEY
    ?.trim() ||
  process.env
    .APP_SUPABASE_SERVICE_ROLE_KEY
    ?.trim();


if (
  !url ||
  !serviceKey
) {
  throw new Error(
    "Supabase service-role environment is not configured",
  );
}


const credentialPepper =
  process.env.GEOMACRO_API_CREDENTIAL_PEPPER?.trim() ||
  serviceKey;

if (credentialPepper.length < 32) {
  throw new Error(
    "Server-only API credential pepper must be at least 32 characters",
  );
}


const apiKey =
  `gmrk_${randomBytes(32).toString("hex")}`;


const apiKeyHash =
  createHmac("sha256", credentialPepper)
    .update("geomacro-api-credential-v1\0risk-gate-bearer\0", "utf8")
    .update(apiKey, "utf8")
    .digest("hex");


const db =
  createClient(
    url,
    serviceKey,
    {
      auth: {
        persistSession:
          false,

        autoRefreshToken:
          false,
      },
    },
  );


const {
  error,
} =
  await db
    .from(
      "risk_gate_api_clients",
    )
    .insert({
      client_id:
        clientId,

      display_name:
        displayName,

      api_key_hash:
        apiKeyHash,

      enabled:
        true,

      requests_per_minute:
        requestsPerMinute,
    });


if (error) {
  throw new Error(
    `Client provisioning failed: ${error.message}`,
  );
}


console.log(
  "\n========================================",
);

console.log(
  "RISK GATE CLIENT CREATED",
);

console.log(
  "========================================",
);

console.log({
  client_id:
    clientId,

  display_name:
    displayName,

  requests_per_minute:
    requestsPerMinute,
});


console.log(
  "\nAPI KEY (shown once):",
);

console.log(
  apiKey,
);
