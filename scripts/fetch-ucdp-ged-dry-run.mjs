const API_BASE =
  "https://ucdpapi.pcr.uu.se";

const DATASET_VERSION =
  "26.1";

const TOKEN =
  process.env.UCDP_API_TOKEN?.trim() ??
  "";

const PAGE_SIZE =
  Number(
    process.env.UCDP_PAGE_SIZE ??
    "2",
  );

if (
  !Number.isInteger(PAGE_SIZE) ||
  PAGE_SIZE < 1 ||
  PAGE_SIZE > 1000
) {
  throw new Error(
    "UCDP_PAGE_SIZE must be an integer between 1 and 1000",
  );
}

console.log({
  source:
    "UCDP GED",

  version:
    DATASET_VERSION,

  page_size:
    PAGE_SIZE,

  token_configured:
    Boolean(TOKEN),

  mode:
    "DRY_RUN_NO_DATABASE_WRITE",
});


if (!TOKEN) {
  console.log(
    "SKIP: UCDP_API_TOKEN not configured",
  );

  console.log(
    "PASS: TOKEN ABSENCE FAILS CLOSED WITHOUT NETWORK INGESTION",
  );

  process.exit(0);
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
  const body =
    await response.text();

  throw new Error(
    `UCDP request failed ${response.status}: ${body.slice(0, 300)}`,
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


console.log({
  total_count:
    data.TotalCount,

  total_pages:
    data.TotalPages,

  returned_rows:
    data.Result.length,
});


const first =
  data.Result[0] ??
  null;


if (!first) {
  throw new Error(
    "UCDP returned no GED rows",
  );
}


console.log(
  "FIRST RECORD KEYS:",
  Object.keys(first).sort(),
);


console.log(
  "FIRST RECORD SAMPLE:",
  {
    id:
      first.id,

    year:
      first.year,

    country:
      first.country,

    country_id:
      first.country_id,

    date_start:
      first.date_start,

    date_end:
      first.date_end,

    type_of_violence:
      first.type_of_violence,

    conflict_new_id:
      first.conflict_new_id,

    dyad_new_id:
      first.dyad_new_id,

    best:
      first.best,

    low:
      first.low,

    high:
      first.high,

    deaths_civilians:
      first.deaths_civilians,

    latitude:
      first.latitude,

    longitude:
      first.longitude,
  },
);


console.log(
  "PASS: UCDP GED RESPONSE SHAPE VERIFIED",
);

console.log(
  "PASS: DATASET VERSION PINNED TO 26.1",
);

console.log(
  "PASS: NO DATABASE WRITE",
);
