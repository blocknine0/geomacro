import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "geomacro-live-intelligence";

const STRUCTURE_VERSION = "live-structure-v1.3.2";
const COUNTRY_VERSION = "country-attribution-v1.3.0";
const STORY_VERSION = "story-title-jaccard-v1.3.0";
const SCORING_VERSION = "live-risk-score-v1.3.1";
const RELEVANCE_VERSION = "professional-relevance-v1.1.2";

const BATCH_SIZE = 60;
const STORY_THRESHOLD = 0.40;
const RECENT_EVENT_HOURS = 72;

type Domain =
  | "geopolitics"
  | "macro"
  | "rare_earth"
  | "multi";

type Direction =
  | "escalating"
  | "cooling"
  | "steady"
  | "unknown";

type Evidence = {
  i: string;
  u: string;
  d?: string | null;
  h?: string | null;
  o?: string | null;
  t?: string | null;
  x?: string | null;
  l?: string | null;
  a?: string | null;
  q?: string[];
  g?: string | null;
};

type CountryRow = {
  iso3: string;
  country_name: string;
  aliases: string[];
  demonyms: string[];
};

type CountryHit = {
  iso3: string;
  name: string;
  confidence: number;
  method: string;
  mentions: number;
};

type CountryTerm = {
  iso3: string;
  name: string;
  confidence: number;
  method: string;
};

type Rule = {
  id: string;
  label: string;
  base: number;
  domain?: Domain;
  patterns: RegExp[];
  channels: string[];
  why: string;
};

type EventState = {
  id: string;
  storyKey: string;
  domain: Domain;
  eventType: string;
  eventLabel: string;

  title: string;
  summary: string;

  primaryCountry: string | null;
  primaryCountryName: string | null;
  countries: string[];

  severity: number;
  confidence: number;
  direction: Direction;

  firstSeenAt: string;
  lastSeenAt: string;

  evidenceCount: number;
  evidenceRefs: string[];

  sourceDomains: Set<string>;
  clusterTokens: string[];

  why: string;
  channels: string[];

  severityProof: Record<string, unknown>;
  confidenceProof: Record<string, unknown>;

  isNew: boolean;
  changed: boolean;
};

const STOP = new Set([
  "the","a","an","and","or","but","of","to","in","on","at",
  "for","from","by","with","as","is","are","was","were",
  "be","been","being","this","that","these","those","its",
  "it","their","after","before","over","under","into",
  "amid","about","against","new","says","say","said",
  "report","reports","latest","update","updates",
]);

const AMBIGUOUS_TERMS = new Set([
  "georgia",
  "jordan",
  "chad",
  "turkey",
]);

const RULES: Rule[] = [
  {
    id: "military_attack",
    label: "Military escalation",
    domain: "geopolitics",
    base: 78,
    patterns: [
      /\bmissile/i,
      /\bairstrike/i,
      /\bair strike/i,
      /\bdrone attack/i,
      /\bmilitary attack/i,
      /\binvasion/i,
      /\bbombard/i,
    ],
    channels: [
      "security",
      "markets",
      "energy",
      "trade",
      "supply_chain",
    ],
    why:
      "Military escalation can alter sovereign risk, commodity pricing, trade routes, sanctions exposure and cross-border operating conditions.",
  },

  {
    id: "conflict",
    label: "Conflict development",
    domain: "geopolitics",
    base: 69,
    patterns: [
      /(?<!trade )(?<!secretary of )\bwar\b/i,
      /\barmed conflict/i,
      /\bfighting\b/i,
      /\bclashes\b/i,
      /\bceasefire\b/i,
    ],
    channels: [
      "security",
      "trade",
      "markets",
      "supply_chain",
    ],
    why:
      "Conflict developments can change security conditions, market expectations, trade flows and operational exposure.",
  },

  {
    id: "sanctions_export_control",
    label: "Sanctions or export-control development",
    base: 68,
    patterns: [
      /\bsanction/i,
      /\bexport control/i,
      /\bexport ban/i,
      /\bembargo/i,
      /\btrade restriction/i,
    ],
    channels: [
      "trade",
      "compliance",
      "supply_chain",
      "markets",
    ],
    why:
      "Sanctions and export controls can change counterparty access, trade eligibility, supply availability and compliance obligations.",
  },

  {
    id: "tariff_trade_policy",
    label: "Tariff or trade-policy development",
    base: 57,
    patterns: [
      /\btariff/i,
      /\btrade war\b/i,
      /\bimport dut/i,
      /\btrade restriction/i,
    ],
    channels: [
      "trade",
      "inflation",
      "supply_chain",
      "markets",
    ],
    why:
      "Tariff and trade-policy changes can affect import costs, inflation pressure, supply-chain routing and corporate margins.",
  },

  {
    id: "political_instability",
    label: "Political instability",
    domain: "geopolitics",
    base: 63,
    patterns: [
      /\bcoup\b/i,
      /\bmass protest/i,
      /\briot/i,
      /\bstate of emergency\b/i,
      /\bgovernment collapse/i,
    ],
    channels: [
      "political",
      "markets",
      "operations",
      "capital_flows",
    ],
    why:
      "Political instability can weaken policy continuity, investment confidence, operating conditions and capital flows.",
  },

  {
    id: "election",
    label: "Election or referendum development",
    domain: "geopolitics",
    base: 41,
    patterns: [
      /\belection/i,
      /\breferendum/i,
      /\bvoting\b/i,
      /\bballot\b/i,
    ],
    channels: [
      "political",
      "policy",
      "markets",
    ],
    why:
      "Election outcomes can change fiscal, trade, regulatory and foreign-policy expectations.",
  },

  {
    id: "monetary_policy",
    label: "Monetary-policy development",
    domain: "macro",
    base: 48,
    patterns: [
      /\binterest rate/i,
      /\brate hike/i,
      /\brate cut/i,
      /\bcentral bank/i,
      /\bmonetary policy/i,
    ],
    channels: [
      "rates",
      "currency",
      "credit",
      "markets",
    ],
    why:
      "Monetary-policy changes can affect borrowing costs, currencies, liquidity, asset prices and financing conditions.",
  },

  {
    id: "inflation",
    label: "Inflation development",
    domain: "macro",
    base: 46,
    patterns: [
      /\binflation\b/i,
      /\bcpi\b/i,
      /\bconsumer price/i,
      /\bppi\b/i,
    ],
    channels: [
      "inflation",
      "rates",
      "consumer",
      "markets",
    ],
    why:
      "Inflation changes can shift rate expectations, real purchasing power, operating costs and asset valuations.",
  },

  {
    id: "growth_recession",
    label: "Growth or recession development",
    domain: "macro",
    base: 55,
    patterns: [
      /\brecession\b/i,
      /\bgdp\b/i,
      /\bgross domestic product\b/i,
      /\beconomic contraction/i,
    ],
    channels: [
      "growth",
      "credit",
      "employment",
      "markets",
    ],
    why:
      "Growth deterioration or recovery can change earnings expectations, credit risk, employment conditions and fiscal pressure.",
  },

  {
    id: "sovereign_debt",
    label: "Sovereign-debt or fiscal development",
    domain: "macro",
    base: 62,
    patterns: [
      /\bsovereign debt\b/i,
      /\bdefault\b/i,
      /\bdebt crisis\b/i,
      /\bfiscal crisis\b/i,
      /\bbond yield/i,
    ],
    channels: [
      "sovereign",
      "credit",
      "currency",
      "banking",
      "markets",
    ],
    why:
      "Sovereign-debt stress can affect credit conditions, currencies, banking systems and cross-border capital flows.",
  },

  {
    id: "labor_market",
    label: "Labour-market development",
    domain: "macro",
    base: 39,
    patterns: [
      /\bunemployment\b/i,
      /\bpayroll/i,
      /\bjobs report\b/i,
      /\bemployment\b/i,
    ],
    channels: [
      "employment",
      "consumer",
      "rates",
      "growth",
    ],
    why:
      "Labour-market changes can affect household demand, wage pressure, monetary-policy expectations and growth.",
  },

  {
    id: "critical_mineral_export",
    label: "Critical-mineral export-control development",
    domain: "rare_earth",
    base: 72,
    patterns: [
      /\brare earth.*export/i,
      /\bcritical mineral.*export/i,
      /\bexport.*rare earth/i,
      /\bexport.*critical mineral/i,
      /\bmagnet.*export/i,
    ],
    channels: [
      "critical_minerals",
      "trade",
      "manufacturing",
      "supply_chain",
      "defense",
    ],
    why:
      "Critical-mineral export restrictions can affect industrial inputs, strategic manufacturing, defense supply chains and pricing power.",
  },

  {
    id: "critical_mineral_supply",
    label: "Critical-mineral supply development",
    domain: "rare_earth",
    base: 64,
    patterns: [
      /\bmine shutdown/i,
      /\bmining disruption/i,
      /\bprocessing disruption/i,
      /\brefinery shutdown/i,
      /\bsupply disruption/i,
      /\bseparation plant/i,
    ],
    channels: [
      "critical_minerals",
      "supply_chain",
      "manufacturing",
      "prices",
    ],
    why:
      "Mine, processing or refining disruptions can tighten strategic-material availability and affect downstream manufacturing.",
  },

  {
    id: "critical_mineral_policy",
    label: "Critical-mineral policy development",
    domain: "rare_earth",
    base: 51,
    patterns: [
      /\brare earth/i,
      /\bcritical mineral/i,
      /\bndpr\b/i,
      /\bndfeb\b/i,
      /\bpermanent magnet/i,
    ],
    channels: [
      "critical_minerals",
      "industrial_policy",
      "supply_chain",
      "investment",
    ],
    why:
      "Critical-mineral policy changes can reshape strategic supply, processing capacity, project economics and investment flows.",
  },
];

const ESCALATION = [
  /\bescalat/i,
  /\battack/i,
  /\bstrike/i,
  /\binvasion/i,
  /\bemergency\b/i,
  /\bshutdown\b/i,
  /\bban\b/i,
  /\brestrict/i,
  /\bdefault\b/i,
  /\bcrisis\b/i,
];

const COOLING = [
  /\bceasefire\b/i,
  /\bde-escalat/i,
  /\bpeace agreement\b/i,
  /\bagreement reached\b/i,
  /\blift sanctions\b/i,
  /\blifts sanctions\b/i,
  /\breopen/i,
];

function response(body: unknown, status = 200) {
  return new Response(
    JSON.stringify(body, null, 2),
    {
      status,
      headers: {
        "content-type":
          "application/json; charset=utf-8",
      },
    },
  );
}

function admin() {
  const url = Deno.env.get("SUPABASE_URL");
  const secretMap =
    Deno.env.get("SUPABASE_SECRET_KEYS");
  const legacy =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url) {
    throw new Error("SUPABASE_URL missing");
  }

  let key: string | undefined;

  if (secretMap) {
    try {
      key = JSON.parse(secretMap).default;
    } catch {
      key = undefined;
    }
  }

  key ||= legacy;

  if (!key) {
    throw new Error(
      "No Supabase backend secret available",
    );
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function norm(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string) {
  return [
    ...new Set(
      norm(value)
        .split(" ")
        .filter(
          (x) =>
            x.length >= 3 &&
            !STOP.has(x),
        ),
    ),
  ].slice(0, 24);
}

function jaccard(
  left: string[],
  right: string[],
) {
  const a = new Set(left);
  const b = new Set(right);

  if (!a.size || !b.size) {
    return 0;
  }

  let overlap = 0;

  for (const x of a) {
    if (b.has(x)) {
      overlap++;
    }
  }

  return (
    overlap /
    new Set([...a, ...b]).size
  );
}

async function sha256(value: string) {
  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(value),
    );

  return [
    ...new Uint8Array(digest),
  ]
    .map((x) =>
      x.toString(16).padStart(2, "0")
    )
    .join("");
}

async function unzip(blob: Blob) {
  return await new Response(
    blob
      .stream()
      .pipeThrough(
        new DecompressionStream("gzip"),
      ),
  ).text();
}

function countryTermIndex(
  rows: CountryRow[],
) {
  const candidates =
    new Map<
      string,
      Map<string, CountryTerm>
    >();

  function add(
    raw: string,
    country: CountryRow,
    confidence: number,
    method: string,
  ) {
    const key = norm(raw);

    if (!key) {
      return;
    }

    if (
      key.length < 3 ||
      /^[a-z]{2}$/.test(key) ||
      AMBIGUOUS_TERMS.has(key)
    ) {
      return;
    }

    const words =
      key.split(" ");

    if (words.length > 6) {
      return;
    }

    let byCountry =
      candidates.get(key);

    if (!byCountry) {
      byCountry =
        new Map<
          string,
          CountryTerm
        >();

      candidates.set(
        key,
        byCountry,
      );
    }

    const existing =
      byCountry.get(
        country.iso3,
      );

    if (
      !existing ||
      confidence >
        existing.confidence
    ) {
      byCountry.set(
        country.iso3,
        {
          iso3:
            country.iso3,

          name:
            country.country_name,

          confidence,

          method,
        },
      );
    }
  }

  for (const country of rows) {
    add(
      country.country_name,
      country,
      94,
      "country_common_name",
    );

    for (
      const alias of
        country.aliases ?? []
    ) {
      add(
        alias,
        country,
        norm(alias).includes(" ")
          ? 93
          : 86,
        "country_alias",
      );
    }

    for (
      const demonym of
        country.demonyms ?? []
    ) {
      add(
        demonym,
        country,
        91,
        "country_demonym",
      );
    }
  }

  const index =
    new Map<
      string,
      CountryTerm
    >();

  for (
    const [
      term,
      byCountry,
    ] of candidates
  ) {
    // Safety rule:
    // a lexical term shared by more
    // than one country is never used
    // for automatic attribution.
    //
    // Example in current registry:
    // "American" maps to both USA
    // and Northern Mariana Islands.
    if (
      byCountry.size !== 1
    ) {
      continue;
    }

    index.set(
      term,
      [
        ...byCountry.values(),
      ][0],
    );
  }

  return index;
}

function detectCountries(
  text: string,
  index: Map<
    string,
    CountryTerm
  >,
): CountryHit[] {
  const words = norm(text)
    .split(" ")
    .filter(Boolean);

  const found =
    new Map<
      string,
      CountryHit
    >();

  const maxN =
    Math.min(6, words.length);

  for (
    let start = 0;
    start < words.length;
    start++
  ) {
    for (
      let size = 1;
      size <= maxN &&
      start + size <= words.length;
      size++
    ) {
      const phrase = words
        .slice(
          start,
          start + size,
        )
        .join(" ");

      const match =
        index.get(phrase);

      if (!match) {
        continue;
      }

      const existing =
        found.get(match.iso3);

      if (!existing) {
        found.set(
          match.iso3,
          {
            iso3: match.iso3,
            name: match.name,
            confidence:
              match.confidence,
            method:
              match.method,
            mentions: 1,
          },
        );

        continue;
      }

      existing.mentions++;

      existing.confidence =
        Math.min(
          99,
          Math.max(
            existing.confidence,
            match.confidence,
          ) +
            Math.min(
              3,
              existing.mentions - 1,
            ),
        );
    }
  }

  return [
    ...found.values(),
  ].sort(
    (a, b) =>
      b.confidence -
        a.confidence ||
      b.mentions -
        a.mentions ||
      a.iso3.localeCompare(
        b.iso3,
      ),
  );
}

const GEO_RELEVANCE = [
  /(?<!trade )(?<!secretary of )\bwar\b/i,
  /\bclashes?\b/i,
  /\bceasefire\b/i,
  /\bmissile/i,
  /\bairstrike/i,
  /\bdrone attack/i,
  /\bmilitary\b/i,
  /\binvasion/i,
  /\bsanction/i,
  /\bexport control/i,
  /\bexport ban/i,
  /\bembargo/i,
  /\bcoup\b/i,
  /\belection/i,
  /\breferendum/i,
  /\bnato\b/i,
  /\bsecurity council\b/i,
  /\btariff/i,
  /\btrade war\b/i,
  /\bborder (?:clash|conflict|tension)/i,
  /\bstrikes?\b/i,
];

const MACRO_RELEVANCE = [
  /\binterest rate/i,
  /\brate hike/i,
  /\brate cut/i,
  /\bcentral bank/i,
  /\bbank of canada\b/i,
  /\bfederal reserve\b/i,
  /\bthe fed\b/i,
  /\becb\b/i,
  /\bbank of england\b/i,
  /\bbank of japan\b/i,
  /\brbi\b/i,
  /\binflation\b/i,
  /\bcpi\b/i,
  /\bppi\b/i,
  /\bgdp\b/i,
  /\bgross domestic product\b/i,
  /\bunemployment\b/i,
  /\bpayroll/i,
  /\bpmi\b/i,
  /\brecession\b/i,
  /\bsovereign debt\b/i,
  /\bbond yield/i,
  /\bfiscal\b/i,
  /\btrade balance\b/i,
  /\bcurrent account\b/i,
  /\bforeign exchange\b/i,
  /\bcurrency\b/i,
  /\bbanking crisis\b/i,
  /\bsovereign default\b/i,
];

const RARE_EARTH_RELEVANCE = [
  /\brare earth/i,
  /\bcritical mineral/i,
  /\bneodymium\b/i,
  /\bpraseodymium\b/i,
  /\bdysprosium\b/i,
  /\bterbium\b/i,
  /\byttrium\b/i,
  /\blanthanum\b/i,
  /\bcerium\b/i,
  /\bsamarium\b/i,
  /\beuropium\b/i,
  /\bgadolinium\b/i,
  /\bndpr\b/i,
  /\bndfeb\b/i,
  /\bpermanent magnet/i,
  /\brare[- ]earth oxide/i,
  /\brare[- ]earth metal/i,
  /\bmineral processing\b/i,
  /\bmineral refining\b/i,
  /\bseparation plant\b/i,
];

const SPORTS_NOISE =
  /\b(FIA|Formula 1|F1|McLaren|Grand Prix|MotoGP|NBA|NFL|MLB|NHL|Premier League|Champions League|cricket|tennis|golf)\b/i;

const LOCAL_CRIME_NOISE =
  /\b(constable|police blotter|robbery|burglary|stabbing|knife attack|murder suspect|local police)\b/i;

const LOCAL_SCHOOL_STRIKE_NOISE =
  /\b(?:school|schools|superintendent|school district|teacher|teachers)\b.*\bstrikes?\b|\bstrikes?\b.*\b(?:school|schools|superintendent|school district|teacher|teachers)\b/i;

const MEDIA_COMMENTARY_NOISE =
  /\blegacy media\b|\btake(?:s|n)? a beating from\b/i;

const NON_GEOPOLITICAL_STRIKE_NOISE =
  /\bbird strike\b|\bstrikes? back\b/i;

const METAPHORICAL_WAR_NOISE =
  /\bculture war\b|\bcheese war\b/i;

const CORPORATE_COUP_NOISE =
  /\b(?:brand|brands|agency|agencies|advertising|marketing|campaign|publicis|pepsi)\b.*\bcoup\b|\bcoup\b.*\b(?:brand|brands|agency|agencies|advertising|marketing|campaign|publicis|pepsi)\b/i;

const ELECTION_ARCHIVE_NOISE =
  /\belection archives?\b|\barchives?\s*[-:|]\s*.*election\b/i;

const FUEL_PRICE_FLUFF =
  /\b(gas prices?|petrol prices?|gasoline prices?)\b/i;

function matchCount(
  text: string,
  patterns: RegExp[],
) {
  return patterns.reduce(
    (count, pattern) =>
      count + (pattern.test(text) ? 1 : 0),
    0,
  );
}

function mergeCountryHits(
  titleHits: CountryHit[],
  descriptionHits: CountryHit[],
) {
  const merged =
    new Map<string, CountryHit>();

  for (const hit of [
    ...titleHits,
    ...descriptionHits,
  ]) {
    const existing =
      merged.get(hit.iso3);

    if (!existing) {
      merged.set(hit.iso3, {
        ...hit,
      });
      continue;
    }

    existing.confidence =
      Math.max(
        existing.confidence,
        hit.confidence,
      );

    existing.mentions +=
      hit.mentions;
  }

  return [
    ...merged.values(),
  ].sort(
    (a, b) =>
      b.confidence -
        a.confidence ||
      b.mentions -
        a.mentions ||
      a.iso3.localeCompare(
        b.iso3,
      ),
  );
}

function choosePrimaryCountry(
  titleHits: CountryHit[],
  _descriptionHits: CountryHit[],
): CountryHit | null {
  // Production-safety rule:
  // primary geography must be explicit
  // and unambiguous in the headline.
  //
  // Description/snippet geography is
  // retained as supporting countries,
  // but cannot assign primary country.
  if (titleHits.length === 1) {
    return titleHits[0];
  }

  return null;
}

function resolveDomain(
  text: string,
  ingestTopics: string[] | undefined,
) {
  const scores = {
    geopolitics:
      matchCount(
        text,
        GEO_RELEVANCE,
      ),

    macro:
      matchCount(
        text,
        MACRO_RELEVANCE,
      ),

    rare_earth:
      matchCount(
        text,
        RARE_EARTH_RELEVANCE,
      ),
  };

  const ranked = [
    {
      domain:
        "geopolitics" as Domain,
      score:
        scores.geopolitics,
    },
    {
      domain:
        "macro" as Domain,
      score:
        scores.macro,
    },
    {
      domain:
        "rare_earth" as Domain,
      score:
        scores.rare_earth,
    },
  ].sort(
    (a, b) =>
      b.score - a.score,
  );

  if (ranked[0].score === 0) {
    const valid = [
      ...new Set(
        (ingestTopics ?? [])
          .filter(
            (x) =>
              x ===
                "geopolitics" ||
              x === "macro" ||
              x ===
                "rare_earth",
          ),
      ),
    ];

    return {
      domain:
        valid.length === 1
          ? valid[0] as Domain
          : "multi" as Domain,

      scores,

      method:
        "ingest_topic_fallback",
    };
  }

  if (
    ranked[1].score >= 2 &&
    ranked[0].score -
      ranked[1].score <=
      1
  ) {
    return {
      domain:
        "multi" as Domain,
      scores,
      method:
        "multi_domain_signal",
    };
  }

  return {
    domain:
      ranked[0].domain,
    scores,
    method:
      "dominant_professional_signal",
  };
}

function professionalRelevance(
  title: string,
  text: string,
  decision:
    ReturnType<
      typeof resolveDomain
    >,
) {
  const maxSignal =
    Math.max(
      decision.scores
        .geopolitics,
      decision.scores.macro,
      decision.scores
        .rare_earth,
    );

  const titleGeo =
    matchCount(
      title,
      GEO_RELEVANCE,
    );

  const titleMacro =
    matchCount(
      title,
      MACRO_RELEVANCE,
    );

  const titleRareEarth =
    matchCount(
      title,
      RARE_EARTH_RELEVANCE,
    );

  const titleSignal =
    Math.max(
      titleGeo,
      titleMacro,
      titleRareEarth,
    );

  if (
    SPORTS_NOISE.test(title) &&
    titleSignal < 2
  ) {
    return {
      relevant: false,
      reason:
        "sports_or_motorsport_noise",
    };
  }

  if (
    LOCAL_CRIME_NOISE.test(text) &&
    decision.scores
        .geopolitics < 2 &&
    decision.scores.macro === 0 &&
    decision.scores
        .rare_earth === 0
  ) {
    return {
      relevant: false,
      reason:
        "local_crime_noise",
    };
  }

  if (
    LOCAL_SCHOOL_STRIKE_NOISE.test(title)
  ) {
    return {
      relevant: false,
      reason:
        "local_school_strike_noise",
    };
  }

  if (
    MEDIA_COMMENTARY_NOISE.test(title) &&
    titleSignal < 2
  ) {
    return {
      relevant: false,
      reason:
        "media_commentary_noise",
    };
  }

  if (
    NON_GEOPOLITICAL_STRIKE_NOISE.test(title)
  ) {
    return {
      relevant: false,
      reason:
        "non_geopolitical_strike_noise",
    };
  }

  if (
    METAPHORICAL_WAR_NOISE.test(title)
  ) {
    return {
      relevant: false,
      reason:
        "metaphorical_war_noise",
    };
  }

  if (
    CORPORATE_COUP_NOISE.test(title)
  ) {
    return {
      relevant: false,
      reason:
        "corporate_coup_noise",
    };
  }

  if (
    ELECTION_ARCHIVE_NOISE.test(title)
  ) {
    return {
      relevant: false,
      reason:
        "election_archive_noise",
    };
  }

  if (
    FUEL_PRICE_FLUFF.test(title) &&
    titleMacro === 0 &&
    titleGeo === 0 &&
    titleRareEarth === 0
  ) {
    return {
      relevant: false,
      reason:
        "consumer_price_fluff",
    };
  }

  // Description-only single keyword
  // is not enough for professional
  // structured intelligence.
  if (
    titleSignal === 0 &&
    maxSignal < 2
  ) {
    return {
      relevant: false,
      reason:
        "weak_professional_relevance",
    };
  }

  return {
    relevant: true,
    reason: "accepted",
  };
}

function fallbackRule(
  value: Domain,
): Rule {
  if (value === "rare_earth") {
    return {
      id:
        "critical_mineral_development",
      label:
        "Critical-mineral development",
      base: 45,
      patterns: [],
      channels: [
        "critical_minerals",
        "supply_chain",
      ],
      why:
        "The development may affect strategic-material availability, industrial supply chains or critical-mineral investment conditions.",
    };
  }

  if (value === "macro") {
    return {
      id: "macro_development",
      label:
        "Macroeconomic development",
      base: 42,
      patterns: [],
      channels: [
        "growth",
        "markets",
        "policy",
      ],
      why:
        "The development may change macroeconomic expectations, financing conditions or market risk.",
    };
  }

  if (
    value === "geopolitics"
  ) {
    return {
      id:
        "geopolitical_development",
      label:
        "Geopolitical development",
      base: 48,
      patterns: [],
      channels: [
        "political",
        "trade",
        "markets",
      ],
      why:
        "The development may change geopolitical exposure, policy expectations, trade conditions or market risk.",
    };
  }

  return {
    id:
      "cross_domain_development",
    label:
      "Cross-domain risk development",
    base: 46,
    patterns: [],
    channels: [
      "markets",
      "policy",
      "trade",
    ],
    why:
      "The development spans multiple risk domains and may affect policy, markets, trade or operating conditions.",
  };
}

function ruleFor(
  text: string,
  value: Domain,
) {
  if (value === "multi") {
    return fallbackRule(value);
  }

  return (
    RULES
      .filter(
        (rule) =>
          !rule.domain ||
          rule.domain === value ||
          value === "multi",
      )
      .filter(
        (rule) =>
          rule.patterns.some(
            (pattern) =>
              pattern.test(text),
          ),
      )
      .sort(
        (a, b) => {
          const aSpecific =
            a.domain === value
              ? 1
              : 0;

          const bSpecific =
            b.domain === value
              ? 1
              : 0;

          return (
            bSpecific -
              aSpecific ||
            b.base - a.base
          );
        },
      )[0] ??
    fallbackRule(value)
  );
}

function direction(
  text: string,
): Direction {
  const up =
    ESCALATION.filter(
      (x) => x.test(text),
    ).length;

  const down =
    COOLING.filter(
      (x) => x.test(text),
    ).length;

  if (
    up > down &&
    up > 0
  ) {
    return "escalating";
  }

  if (
    down > up &&
    down > 0
  ) {
    return "cooling";
  }

  if (
    !up &&
    !down
  ) {
    return "steady";
  }

  return "unknown";
}

function severity(
  rule: Rule,
  text: string,
  trend: Direction,
  sourceCount: number,
) {
  const modifiers: {
    reason: string;
    value: number;
  }[] = [];

  if (
    /\bnuclear\b/i.test(text)
  ) {
    modifiers.push({
      reason:
        "nuclear_reference",
      value: 12,
    });
  }

  if (
    /\bstate of emergency\b/i
      .test(text)
  ) {
    modifiers.push({
      reason:
        "state_of_emergency",
      value: 7,
    });
  }

  if (
    /\bdefault\b/i.test(text)
  ) {
    modifiers.push({
      reason:
        "default_reference",
      value: 8,
    });
  }

  if (
    trend === "escalating"
  ) {
    modifiers.push({
      reason:
        "escalating_signal",
      value: 5,
    });
  }

  if (
    trend === "cooling"
  ) {
    modifiers.push({
      reason:
        "cooling_signal",
      value: -7,
    });
  }

  const corroboration =
    Math.min(
      9,
      Math.max(
        0,
        sourceCount - 1,
      ) * 3,
    );

  if (corroboration) {
    modifiers.push({
      reason:
        "independent_source_corroboration",
      value: corroboration,
    });
  }

  const value =
    Math.max(
      0,
      Math.min(
        100,
        rule.base +
          modifiers.reduce(
            (sum, item) =>
              sum +
              item.value,
            0,
          ),
      ),
    );

  return {
    methodology:
      SCORING_VERSION,
    value,
    base: rule.base,
    modifiers,
  };
}

function confidence(
  countryConfidence:
    number | null,
  sourceCount: number,
  specificRule: boolean,
) {
  const geography =
    countryConfidence === null
      ? 4
      : Math.round(
          countryConfidence *
            0.20,
        );

  const classification =
    specificRule ? 24 : 12;

  const corroboration =
    sourceCount <= 1
      ? 10
      : Math.min(
          26,
          10 +
            (sourceCount - 1) *
              6,
        );

  const provenance = 16;

  const uncapped =
    Math.max(
      0,
      Math.min(
        100,
        geography +
          classification +
          corroboration +
          provenance,
      ),
    );

  const sourceCap =
    sourceCount <= 1
      ? 72
      : sourceCount === 2
      ? 82
      : sourceCount === 3
      ? 90
      : 95;

  return {
    methodology:
      SCORING_VERSION,

    value:
      Math.min(
        uncapped,
        sourceCap,
      ),

    uncapped_value:
      uncapped,

    source_cap:
      sourceCap,

    components: {
      geography,
      classification,
      corroboration,
      provenance,
    },
  };
}

function published(
  raw:
    string |
    null |
    undefined,
  fallback: string,
) {
  if (raw) {
    const normal =
      new Date(raw);

    if (
      !Number.isNaN(
        normal.getTime(),
      )
    ) {
      return normal.toISOString();
    }

    if (
      /^\d{14}$/.test(raw)
    ) {
      return new Date(
        Date.UTC(
          Number(
            raw.slice(0, 4),
          ),
          Number(
            raw.slice(4, 6),
          ) - 1,
          Number(
            raw.slice(6, 8),
          ),
          Number(
            raw.slice(8, 10),
          ),
          Number(
            raw.slice(10, 12),
          ),
          Number(
            raw.slice(12, 14),
          ),
        ),
      ).toISOString();
    }
  }

  return fallback;
}

function summary(
  name: string | null,
  label: string,
  trend: Direction,
  evidenceCount: number,
  sourceCount: number,
) {
  return (
    `Geomacro detected a source-backed ${label.toLowerCase()} ` +
    `associated with ${name ?? "global conditions"}. ` +
    `Current direction is ${trend}. ` +
    `${evidenceCount} evidence item${evidenceCount === 1 ? "" : "s"} ` +
    `across ${sourceCount} independent source domain${sourceCount === 1 ? "" : "s"} ` +
    `support the current structured event.`
  );
}

Deno.serve(async (req) => {
  if (
    req.method !== "POST"
  ) {
    return response(
      {
        ok: false,
        error:
          "POST required",
      },
      405,
    );
  }

  const expected =
    Deno.env.get(
      "LIVE_STRUCTURE_TOKEN",
    );

  const supplied =
    req.headers.get(
      "x-geomacro-structure-token",
    );

  if (
    !expected ||
    expected !== supplied
  ) {
    return response(
      {
        ok: false,
        error:
          "unauthorized",
      },
      401,
    );
  }

  const db = admin();
  const startedAt =
    new Date().toISOString();

  let runId:
    string | null = null;

  try {
    const {
      data: run,
      error: runError,
    } = await db
      .from(
        "live_structuring_runs",
      )
      .insert({
        structure_version:
          STRUCTURE_VERSION,
        country_version:
          COUNTRY_VERSION,
        story_version:
          STORY_VERSION,
        scoring_version:
          SCORING_VERSION,
        status: "running",
        started_at:
          startedAt,
      })
      .select("id")
      .single();

    if (runError) {
      throw runError;
    }

    runId = run.id;

    const {
      data: countryRows,
      error: countryError,
    } = await db
      .from(
        "live_country_registry",
      )
      .select(
        "iso3,country_name,aliases,demonyms",
      )
      .eq(
        "enabled",
        true,
      );

    if (countryError) {
      throw countryError;
    }

    if (
      !countryRows ||
      countryRows.length < 200
    ) {
      throw new Error(
        "Country registry is incomplete",
      );
    }

    const countryIndex =
      countryTermIndex(
        countryRows as CountryRow[],
      );

    const {
      data: manifests,
      error: manifestError,
    } = await db
      .from(
        "live_fragment_manifest",
      )
      .select(
        "id,object_path,item_count,period_end,verified_at",
      )
      .eq(
        "verification_method",
        "storage-readback-sha256",
      )
      .order(
        "period_end",
        {
          ascending: true,
        },
      )
      .limit(30);

    if (manifestError) {
      throw manifestError;
    }

    let manifest:
      any = null;

    let handledBefore = 0;

    for (
      const candidate of
        manifests ?? []
    ) {
      const {
        count:
          structuredCount,
        error:
          structuredCountError,
      } = await db
        .from(
          "live_structured_event_evidence",
        )
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq(
          "fragment_id",
          candidate.id,
        );

      if (
        structuredCountError
      ) {
        throw structuredCountError;
      }

      const {
        count:
          excludedCount,
        error:
          excludedCountError,
      } = await db
        .from(
          "live_structuring_exclusions",
        )
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq(
          "fragment_id",
          candidate.id,
        );

      if (
        excludedCountError
      ) {
        throw excludedCountError;
      }

      const handled =
        (structuredCount ?? 0) +
        (excludedCount ?? 0);

      if (
        handled <
        Number(
          candidate.item_count,
        )
      ) {
        manifest =
          candidate;

        handledBefore =
          handled;

        break;
      }
    }

    if (!manifest) {
      await db
        .from(
          "live_structuring_runs",
        )
        .update({
          status: "empty",
          finished_at:
            new Date()
              .toISOString(),
          metrics: {
            batch_size:
              BATCH_SIZE,
            country_registry_count:
              countryRows.length,
          },
        })
        .eq("id", runId);

      return response({
        ok: true,
        status:
          "nothing_to_structure",
        country_registry_count:
          countryRows.length,
      });
    }

    const {
      data: blob,
      error: downloadError,
    } = await db.storage
      .from(BUCKET)
      .download(
        manifest.object_path,
      );

    if (
      downloadError ||
      !blob
    ) {
      throw (
        downloadError ??
        new Error(
          "Fragment download failed",
        )
      );
    }

    const rawText =
      await unzip(blob);

    const records =
      rawText
        .split("\n")
        .filter(
          (line) =>
            line.trim(),
        )
        .map(
          (
            line,
            ordinal,
          ) => ({
            ordinal,
            record:
              JSON.parse(
                line,
              ) as Evidence,
          }),
        );

    const fingerprints =
      records
        .map(
          (x) =>
            x.record.i,
        )
        .filter(Boolean);

    const done =
      new Set<string>();

    const excluded =
      new Set<string>();

    for (
      let i = 0;
      i <
      fingerprints.length;
      i += 200
    ) {
      const chunk =
        fingerprints.slice(
          i,
          i + 200,
        );

      const {
        data:
          structuredRows,
        error:
          structuredError,
      } = await db
        .from(
          "live_structured_event_evidence",
        )
        .select(
          "fingerprint",
        )
        .in(
          "fingerprint",
          chunk,
        );

      if (
        structuredError
      ) {
        throw structuredError;
      }

      for (
        const row of
          structuredRows ?? []
      ) {
        done.add(
          row.fingerprint,
        );
      }

      const {
        data:
          excludedRows,
        error:
          excludedError,
      } = await db
        .from(
          "live_structuring_exclusions",
        )
        .select(
          "fingerprint",
        )
        .in(
          "fingerprint",
          chunk,
        );

      if (
        excludedError
      ) {
        throw excludedError;
      }

      for (
        const row of
          excludedRows ?? []
      ) {
        excluded.add(
          row.fingerprint,
        );
      }
    }

    const batch =
      records
        .filter(
          (x) =>
            !done.has(
              x.record.i,
            ) &&
            !excluded.has(
              x.record.i,
            ),
        )
        .slice(
          0,
          BATCH_SIZE,
        );

    if (!batch.length) {
      await db
        .from(
          "live_structuring_runs",
        )
        .update({
          status: "empty",
          finished_at:
            new Date()
              .toISOString(),
          fragments_seen: 1,
          evidence_seen:
            records.length,
          metrics: {
            reason:
              "fragment_has_no_unprocessed_records",
          },
        })
        .eq("id", runId);

      return response({
        ok: true,
        status:
          "nothing_new",
      });
    }

    const cutoff =
      new Date(
        Date.now() -
          RECENT_EVENT_HOURS *
            60 *
            60 *
            1000,
      ).toISOString();

    const {
      data: existing,
      error: existingError,
    } = await db
      .from(
        "live_structured_events",
      )
      .select(
        "id,story_key,domain,event_type,title,summary,primary_country,countries,severity,confidence,direction,first_seen_at,last_seen_at,evidence_count,evidence_refs,structured_payload",
      )
      .gte(
        "last_seen_at",
        cutoff,
      )
      .order(
        "last_seen_at",
        {
          ascending: false,
        },
      )
      .limit(1200);

    if (existingError) {
      throw existingError;
    }

    const events:
      EventState[] = [];

    const eventIndex =
      new Map<
        string,
        EventState[]
      >();

    function bucketKey(
      domain: Domain,
      country:
        string | null,
      eventType: string,
    ) {
      return [
        domain,
        country ??
          "GLOBAL",
        eventType,
      ].join("|");
    }

    function addIndex(
      event: EventState,
    ) {
      const key =
        bucketKey(
          event.domain,
          event.primaryCountry,
          event.eventType,
        );

      const list =
        eventIndex.get(key) ??
        [];

      list.push(event);

      eventIndex.set(
        key,
        list,
      );
    }

    for (
      const row of
        existing ?? []
    ) {
      const payload =
        row.structured_payload &&
        typeof
          row.structured_payload ===
          "object"
          ? row
              .structured_payload
          : {};

      const event:
        EventState = {
        id: row.id,
        storyKey:
          row.story_key,
        domain:
          row.domain,
        eventType:
          row.event_type,
        eventLabel:
          payload
            .event_label ??
          row.event_type,
        title:
          row.title,
        summary:
          row.summary ??
          "",
        primaryCountry:
          row.primary_country,
        primaryCountryName:
          payload
            .primary_country_name ??
          null,
        countries:
          row.countries ??
          [],
        severity:
          Number(
            row.severity ??
            0,
          ),
        confidence:
          Number(
            row.confidence ??
            0,
          ),
        direction:
          row.direction ??
          "unknown",
        firstSeenAt:
          row.first_seen_at,
        lastSeenAt:
          row.last_seen_at,
        evidenceCount:
          Number(
            row.evidence_count ??
            0,
          ),
        evidenceRefs:
          Array.isArray(
            row.evidence_refs,
          )
            ? row
                .evidence_refs
                .map(String)
            : [],
        sourceDomains:
          new Set(
            Array.isArray(
              payload
                .source_domains,
            )
              ? payload
                  .source_domains
                  .map(String)
              : [],
          ),
        clusterTokens:
          Array.isArray(
            payload
              .cluster_tokens,
          )
            ? payload
                .cluster_tokens
                .map(String)
            : [],
        why:
          payload
            .why_it_matters ??
          "",
        channels:
          Array.isArray(
            payload
              .risk_channels,
          )
            ? payload
                .risk_channels
                .map(String)
            : [],
        severityProof:
          payload
            .severity ??
          {},
        confidenceProof:
          payload
            .confidence ??
          {},
        isNew: false,
        changed: false,
      };

      events.push(event);
      addIndex(event);
    }

    const evidenceRows:
      Record<
        string,
        unknown
      >[] = [];

    const exclusionRows:
      Record<
        string,
        unknown
      >[] = [];

    let created = 0;
    let updated = 0;
    let attributed = 0;
    let unknown = 0;

    for (
      const {
        ordinal,
        record,
      } of batch
    ) {
      if (
        !record.i ||
        !record.t ||
        !record.u
      ) {
        continue;
      }

      const analysisText =
        [
          record.t,
          record.x ?? "",
        ].join(" ");

      const titleDomainDecision =
        resolveDomain(
          record.t,
          record.q,
        );

      const fullDomainDecision =
        resolveDomain(
          analysisText,
          record.q,
        );

      const titleSignal =
        Math.max(
          titleDomainDecision
            .scores.geopolitics,
          titleDomainDecision
            .scores.macro,
          titleDomainDecision
            .scores.rare_earth,
        );

      // Headline meaning wins whenever
      // it contains a professional signal.
      // Description is fallback context only.
      const domainDecision =
        titleSignal > 0
          ? titleDomainDecision
          : fullDomainDecision;

      const quality =
        professionalRelevance(
          record.t,
          analysisText,
          domainDecision,
        );

      if (!quality.relevant) {
        exclusionRows.push({
          fingerprint:
            record.i,

          fragment_id:
            manifest.id,

          fragment_ordinal:
            ordinal,

          reason_code:
            quality.reason,

          structure_version:
            STRUCTURE_VERSION,

          relevance_version:
            RELEVANCE_VERSION,
        });

        continue;
      }

      const eventDomain =
        domainDecision.domain;

      const titleRule =
        ruleFor(
          record.t,
          eventDomain,
        );

      const eventRule =
        titleRule.id.endsWith(
          "_development",
        )
          ? ruleFor(
              analysisText,
              eventDomain,
            )
          : titleRule;

      const trend =
        direction(
          analysisText,
        );

      const titleGeography =
        detectCountries(
          record.t,
          countryIndex,
        );

      const descriptionGeography =
        detectCountries(
          record.x ?? "",
          countryIndex,
        );

      const geography =
        mergeCountryHits(
          titleGeography,
          descriptionGeography,
        );

      const primary =
        choosePrimaryCountry(
          titleGeography,
          descriptionGeography,
        );

      if (primary) {
        attributed++;
      } else {
        unknown++;
      }

      const titleTokens =
        tokens(record.t);

      const key =
        bucketKey(
          eventDomain,
          primary?.iso3 ??
            null,
          eventRule.id,
        );

      const candidates =
        (
          eventIndex.get(
            key,
          ) ?? []
        ).slice(0, 30);

      let selected:
        EventState |
        null = null;

      let similarity = 0;

      for (
        const candidate of
          candidates
      ) {
        const score =
          jaccard(
            titleTokens,
            candidate
              .clusterTokens,
          );

        if (
          score >=
            STORY_THRESHOLD &&
          score >
            similarity
        ) {
          similarity =
            score;
          selected =
            candidate;
        }
      }

      const seenAt =
        published(
          record.d,
          manifest.period_end,
        );

      if (!selected) {
        const storyKey =
          await sha256(
            [
              STORY_VERSION,
              eventDomain,
              primary?.iso3 ??
                "GLOBAL",
              eventRule.id,
              [...titleTokens]
                .sort()
                .slice(0, 14)
                .join("|"),
            ].join("::"),
          );

        selected = {
          id:
            crypto.randomUUID(),
          storyKey,
          domain:
            eventDomain,
          eventType:
            eventRule.id,
          eventLabel:
            eventRule.label,
          title:
            `${
              primary?.name ??
              "Global"
            }: ${
              eventRule.label
            }`,
          summary: "",
          primaryCountry:
            primary?.iso3 ??
            null,
          primaryCountryName:
            primary?.name ??
            null,
          countries:
            geography
              .slice(0, 6)
              .map(
                (x) =>
                  x.iso3,
              ),
          severity: 0,
          confidence: 0,
          direction:
            trend,
          firstSeenAt:
            seenAt,
          lastSeenAt:
            seenAt,
          evidenceCount: 0,
          evidenceRefs: [],
          sourceDomains:
            new Set<string>(),
          clusterTokens:
            titleTokens,
          why:
            eventRule.why,
          channels:
            eventRule.channels,
          severityProof: {},
          confidenceProof: {},
          isNew: true,
          changed: true,
        };

        events.push(
          selected,
        );

        addIndex(
          selected,
        );

        created++;
      } else if (
        !selected.isNew &&
        !selected.changed
      ) {
        selected.changed =
          true;

        updated++;
      }

      selected
        .evidenceCount++;

      selected
        .evidenceRefs =
        [
          ...new Set([
            ...selected
              .evidenceRefs,
            record.i,
          ]),
        ].slice(-20);

      if (record.h) {
        selected
          .sourceDomains
          .add(record.h);
      }

      for (
        const place of
          geography.slice(
            0,
            6,
          )
      ) {
        if (
          !selected
            .countries
            .includes(
              place.iso3,
            )
        ) {
          selected
            .countries
            .push(
              place.iso3,
            );
        }
      }

      selected.countries =
        selected
          .countries
          .slice(0, 12);

      if (
        seenAt <
        selected
          .firstSeenAt
      ) {
        selected
          .firstSeenAt =
          seenAt;
      }

      if (
        seenAt >
        selected
          .lastSeenAt
      ) {
        selected
          .lastSeenAt =
          seenAt;
      }

      if (
        selected.direction ===
          "steady" &&
        trend !== "steady"
      ) {
        selected.direction =
          trend;
      }

      const sourceCount =
        selected
          .sourceDomains
          .size;

      const severityResult =
        severity(
          eventRule,
          analysisText,
          selected.direction,
          sourceCount,
        );

      const isSpecific =
        !eventRule.id
          .endsWith(
            "_development",
          );

      const confidenceResult =
        confidence(
          primary?.confidence ??
            null,
          sourceCount,
          isSpecific,
        );

      if (
        Number(
          severityResult
            .value,
        ) >=
        selected.severity
      ) {
        selected.severity =
          Number(
            severityResult
              .value,
          );

        selected
          .severityProof =
          severityResult;
      }

      if (
        Number(
          confidenceResult
            .value,
        ) >=
        selected.confidence
      ) {
        selected.confidence =
          Number(
            confidenceResult
              .value,
          );

        selected
          .confidenceProof =
          confidenceResult;
      }

      selected.summary =
        summary(
          selected
            .primaryCountryName,
          selected
            .eventLabel,
          selected.direction,
          selected
            .evidenceCount,
          sourceCount,
        );

      evidenceRows.push({
        event_id:
          selected.id,
        fingerprint:
          record.i,
        fragment_id:
          manifest.id,
        fragment_ordinal:
          ordinal,
        source_domain:
          record.h ??
          null,
        source_url:
          record.u,
        evidence_title:
          record.t,
        evidence_published_at:
          seenAt,
        country_iso3:
          primary?.iso3 ??
          null,
        country_confidence:
          primary?.confidence ??
          null,
        country_method:
          primary?.method ??
          "no_safe_country_match",
      });
    }

    const changed =
      events.filter(
        (x) => x.changed,
      );

    for (
      let i = 0;
      i < changed.length;
      i += 100
    ) {
      const rows =
        changed
          .slice(
            i,
            i + 100,
          )
          .map(
            (event) => ({
              id:
                event.id,

              story_key:
                event.storyKey,

              domain:
                event.domain,

              event_type:
                event.eventType,

              title:
                event.title,

              summary:
                event.summary,

              primary_country:
                event
                  .primaryCountry,

              countries:
                event.countries,

              severity:
                event.severity,

              confidence:
                event.confidence,

              direction:
                event.direction,

              status:
                "active",

              first_seen_at:
                event
                  .firstSeenAt,

              last_seen_at:
                event
                  .lastSeenAt,

              evidence_count:
                event
                  .evidenceCount,

              independent_source_count:
                event
                  .sourceDomains
                  .size,

              evidence_refs:
                event
                  .evidenceRefs,

              structure_version:
                STRUCTURE_VERSION,

              classification_version:
                SCORING_VERSION,

              structured_payload: {
                structure_version:
                  STRUCTURE_VERSION,

                country_version:
                  COUNTRY_VERSION,

                story_version:
                  STORY_VERSION,

                scoring_version:
                  SCORING_VERSION,

                event_label:
                  event
                    .eventLabel,

                primary_country_name:
                  event
                    .primaryCountryName,

                why_it_matters:
                  event.why,

                risk_channels:
                  event.channels,

                what_changed: {
                  state:
                    event.isNew
                      ? "new_event"
                      : "updated_event",

                  direction:
                    event.direction,

                  latest_seen_at:
                    event
                      .lastSeenAt,
                },

                relevance_version:
                  RELEVANCE_VERSION,

                professional_relevance:
                  true,

                country_attribution: {
                  primary_iso3:
                    event
                      .primaryCountry,

                  detected_countries:
                    event.countries,

                  ambiguous_primary:
                    !event
                      .primaryCountry &&
                    event
                      .countries
                      .length > 1,

                  method:
                    event
                      .primaryCountry
                      ? "title_only_unambiguous_country"
                      : event
                          .countries
                          .length > 1
                      ? "ambiguous_multi_country"
                      : "no_safe_country_match",
                },

                story_matching: {
                  methodology:
                    STORY_VERSION,

                  threshold:
                    STORY_THRESHOLD,
                },

                severity:
                  event
                    .severityProof,

                confidence:
                  event
                    .confidenceProof,

                source_domains: [
                  ...event
                    .sourceDomains,
                ].sort(),

                cluster_tokens:
                  event
                    .clusterTokens,

                raw_evidence_customer_visible:
                  false,
              },

              updated_at:
                new Date()
                  .toISOString(),
            }),
          );

      const {
        error,
      } = await db
        .from(
          "live_structured_events",
        )
        .upsert(
          rows,
          {
            onConflict:
              "story_key",
          },
        );

      if (error) {
        throw error;
      }
    }

    for (
      let i = 0;
      i <
      evidenceRows.length;
      i += 100
    ) {
      const {
        error,
      } = await db
        .from(
          "live_structured_event_evidence",
        )
        .upsert(
          evidenceRows.slice(
            i,
            i + 100,
          ),
          {
            onConflict:
              "fingerprint",
            ignoreDuplicates:
              true,
          },
        );

      if (error) {
        throw error;
      }
    }

    for (
      let i = 0;
      i <
      exclusionRows.length;
      i += 100
    ) {
      const {
        error,
      } = await db
        .from(
          "live_structuring_exclusions",
        )
        .upsert(
          exclusionRows.slice(
            i,
            i + 100,
          ),
          {
            onConflict:
              "fingerprint",
            ignoreDuplicates:
              true,
          },
        );

      if (error) {
        throw error;
      }
    }

    const handledAfter =
      handledBefore +
      evidenceRows.length +
      exclusionRows.length;

    const hasMore =
      handledAfter <
      Number(
        manifest.item_count,
      );

    await db
      .from(
        "live_structuring_runs",
      )
      .update({
        status:
          evidenceRows.length
            ? "succeeded"
            : "empty",

        finished_at:
          new Date()
            .toISOString(),

        fragments_seen: 1,

        evidence_seen:
          batch.length,

        evidence_structured:
          evidenceRows.length,

        evidence_duplicate: 0,

        events_created:
          created,

        events_updated:
          updated,

        country_attributed:
          attributed,

        country_unknown:
          unknown,

        metrics: {
          batch_size:
            BATCH_SIZE,

          evidence_excluded:
            exclusionRows.length,

          relevance_version:
            RELEVANCE_VERSION,

          fragment_id:
            manifest.id,

          fragment_total_items:
            manifest.item_count,

          handled_before:
            handledBefore,

          handled_after:
            handledAfter,

          remaining:
            Math.max(
              0,
              Number(
                manifest
                  .item_count,
              ) -
                handledAfter,
            ),

          has_more:
            hasMore,

          country_registry_count:
            countryRows.length,

          country_term_count:
            countryIndex.size,

          story_threshold:
            STORY_THRESHOLD,
        },
      })
      .eq(
        "id",
        runId,
      );

    return response({
      ok: true,

      status:
        "structured_batch",

      run_id:
        runId,

      fragment_id:
        manifest.id,

      batch_size:
        batch.length,

      evidence_structured:
        evidenceRows.length,

      evidence_excluded:
        exclusionRows.length,

      events_created:
        created,

      events_updated:
        updated,

      country_attributed:
        attributed,

      country_unknown:
        unknown,

      handled_before:
        handledBefore,

      handled_after:
        handledAfter,

      fragment_total:
        Number(
          manifest
            .item_count,
        ),

      remaining:
        Math.max(
          0,
          Number(
            manifest
              .item_count,
          ) -
            handledAfter,
        ),

      has_more:
        hasMore,

      versions: {
        structure:
          STRUCTURE_VERSION,

        country:
          COUNTRY_VERSION,

        story:
          STORY_VERSION,

        scoring:
          SCORING_VERSION,

        relevance:
          RELEVANCE_VERSION,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    if (runId) {
      await db
        .from(
          "live_structuring_runs",
        )
        .update({
          status:
            "failed",

          finished_at:
            new Date()
              .toISOString(),

          error_code:
            "STRUCTURING_FAILED",

          error_detail:
            message.slice(
              0,
              2000,
            ),
        })
        .eq(
          "id",
          runId,
        );
    }

    return response(
      {
        ok: false,
        error:
          "STRUCTURING_FAILED",
        detail:
          message,
      },
      500,
    );
  }
});
