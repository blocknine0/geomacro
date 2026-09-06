const API_BASE =
  "https://ucdpapi.pcr.uu.se";

const DATASET_VERSION =
  "26.1";

const RESOURCE =
  "dyadic";

const TOKEN =
  process.env.UCDP_API_TOKEN
    ?.trim() ??
  "";

const PAGE_SIZE =
  Number(
    process.env.UCDP_DYADIC_PAGE_SIZE ??
    "5",
  );


if (
  !Number.isInteger(
    PAGE_SIZE,
  ) ||
  PAGE_SIZE < 1 ||
  PAGE_SIZE > 1000
) {
  throw new Error(
    "UCDP_DYADIC_PAGE_SIZE must be an integer between 1 and 1000",
  );
}


console.log({
  source:
    "UCDP Dyadic Dataset",

  resource:
    RESOURCE,

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
    "PASS: TOKEN ABSENCE FAILS CLOSED",
  );

  process.exit(0);
}


const url =
  new URL(
    `/api/${RESOURCE}/${DATASET_VERSION}`,
    API_BASE,
  );


url.searchParams.set(
  "pagesize",
  String(
    PAGE_SIZE,
  ),
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

        accept:
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
    `UCDP Dyadic request failed ${response.status}: ${body.slice(0, 300)}`,
  );
}


const data =
  await response.json();


if (
  !Array.isArray(
    data.Result,
  )
) {
  throw new Error(
    "UCDP Dyadic response missing Result array",
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
    "UCDP Dyadic returned no rows",
  );
}


console.log(
  "FIRST RECORD KEYS:",
  Object.keys(
    first,
  ).sort(),
);


console.log(
  "FIRST RECORD SAMPLE:",
  first,
);


const interstate =
  data.Result.filter(
    row =>
      Number(
        row.type_of_conflict,
      ) === 2,
  );


console.log({
  interstate_rows_in_sample:
    interstate.length,
});


console.log(
  "PASS: UCDP DYADIC RESPONSE SHAPE VERIFIED",
);

console.log(
  "PASS: DATASET VERSION PINNED TO 26.1",
);

console.log(
  "PASS: NO DATABASE WRITE",
);
