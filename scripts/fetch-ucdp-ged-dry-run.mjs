const API_BASE =
  "https://ucdpapi.pcr.uu.se";

const DATASET_VERSION =
  (process.env.UCDP_CANDIDATE_VERSION ?? "26.0.7").trim();

const TOKEN =
  process.env.UCDP_API_TOKEN?.trim() ??
  "";

const PAGE_SIZE = 1;

if (!/^\d{2}\.0\.\d{1,2}$/.test(DATASET_VERSION)) {
  throw new Error(
    "UCDP_CANDIDATE_VERSION must look like 26.0.7",
  );
}

console.log({
  source:
    "UCDP Candidate Events Dataset",

  version:
    DATASET_VERSION,

  page_size:
    PAGE_SIZE,

  token_configured:
    Boolean(TOKEN),

  api_requests_planned:
    1,

  mode:
    "DRY_RUN_NO_DATABASE_WRITE",
});

if (!TOKEN) {
  throw new Error(
    "UCDP_API_TOKEN not configured",
  );
}

const url =
  new URL(
    `/api/gedevents/${DATASET_VERSION}`,
    API_BASE,
  );

url.searchParams.set(
  "pagesize",
  String(PAGE_SIZE),
);

url.searchParams.set(
  "page",
  "1",
);

const response =
  await fetch(
    url,
    {
      headers: {
        "x-ucdp-access-token":
          TOKEN,

        "accept":
          "application/json",
      },
    },
  );

console.log({
  http_status:
    response.status,

  content_type:
    response.headers.get(
      "content-type",
    ),
});

if (!response.ok) {
  throw new Error(
    `UCDP request failed with HTTP ${response.status}`,
  );
}

const data =
  await response.json();

if (
  !data ||
  typeof data !==
    "object"
) {
  throw new Error(
    "UCDP response is not an object",
  );
}

if (
  !Array.isArray(
    data.Result,
  )
) {
  throw new Error(
    "UCDP response missing Result array",
  );
}

if (data.Result.length !== 1) {
  throw new Error(
    `Expected exactly one UCDP Candidate row; received ${data.Result.length}`,
  );
}

const first =
  data.Result[0];

for (const field of [
  "id",
  "country",
  "date_start",
  "date_end",
  "best",
]) {
  if (!(field in first)) {
    throw new Error(
      `UCDP Candidate response missing required field: ${field}`,
    );
  }
}

console.log({
  total_count:
    data.TotalCount,

  total_pages:
    data.TotalPages,

  returned_rows:
    data.Result.length,

  first_record_id:
    first.id,

  first_record_country:
    first.country,
});

console.log(
  "PASS: UCDP CANDIDATE AUTHENTICATED API ACCESS VERIFIED",
);

console.log(
  "PASS: EXACTLY ONE UCDP API REQUEST USED",
);

console.log(
  "PASS: NO DATABASE WRITE",
);
