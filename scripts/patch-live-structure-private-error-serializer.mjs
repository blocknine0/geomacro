import fs from "node:fs";

const target = "supabase/functions/live-structure-intelligence/index.ts";
let source = fs.readFileSync(target, "utf8");

const hardenedMarker = 'phase=${phase}';
if (source.includes(hardenedMarker)) {
  console.log("Live structure private error serializer is already hardened.");
  process.exit(0);
}

function replaceOnce(label, needle, replacement) {
  const first = source.indexOf(needle);
  if (first < 0) {
    throw new Error(`Patch anchor not found: ${label}`);
  }
  if (source.indexOf(needle, first + needle.length) >= 0) {
    throw new Error(`Patch anchor is not unique: ${label}`);
  }
  source = source.slice(0, first) + replacement + source.slice(first + needle.length);
}

replaceOnce(
  "run phase declaration",
  `  let runId:\n    string | null = null;\n\n  try {`,
  `  let runId:\n    string | null = null;\n\n  let phase =\n    "create_run";\n\n  try {`,
);

replaceOnce(
  "country registry phase",
  `    runId = run.id;\n\n    const {\n      data: countryRows,`,
  `    runId = run.id;\n\n    phase =\n      "country_registry";\n\n    const {\n      data: countryRows,`,
);

replaceOnce(
  "fragment download phase",
  `    const {\n      data: blob,`,
  `    phase =\n      "fragment_download";\n\n    const {\n      data: blob,`,
);

replaceOnce(
  "processed evidence lookup phase",
  `      const {\n        data:\n          structuredRows,`,
  `      phase =\n        "processed_evidence_lookup";\n\n      const {\n        data:\n          structuredRows,`,
);

replaceOnce(
  "exclusion lookup phase",
  `      const {\n        data:\n          excludedRows,`,
  `      phase =\n        "exclusion_lookup";\n\n      const {\n        data:\n          excludedRows,`,
);

replaceOnce(
  "existing event lookup phase",
  `    const {\n      data: existing,`,
  `    phase =\n      "existing_event_lookup";\n\n    const {\n      data: existing,`,
);

replaceOnce(
  "event persistence phase",
  `    const changed =\n      events.filter(`,
  `    phase =\n      "event_persistence";\n\n    const changed =\n      events.filter(`,
);

replaceOnce(
  "evidence persistence phase",
  `    for (\n      let i = 0;\n      i <\n      evidenceRows.length;`,
  `    phase =\n      "evidence_persistence";\n\n    for (\n      let i = 0;\n      i <\n      evidenceRows.length;`,
);

replaceOnce(
  "exclusion persistence phase",
  `    for (\n      let i = 0;\n      i <\n      exclusionRows.length;`,
  `    phase =\n      "exclusion_persistence";\n\n    for (\n      let i = 0;\n      i <\n      exclusionRows.length;`,
);

replaceOnce(
  "final run update phase",
  `    const handledAfter =\n      handledBefore +`,
  `    phase =\n      "finalize_run";\n\n    const handledAfter =\n      handledBefore +`,
);

replaceOnce(
  "opaque catch serializer",
  `  } catch (error) {\n    const message =\n      error instanceof Error\n        ? error.message\n        : String(error);`,
  `  } catch (error) {\n    const compact = (\n      value: unknown,\n      limit: number,\n    ) => {\n      if (\n        typeof value !==\n        "string"\n      ) {\n        return null;\n      }\n\n      const cleaned =\n        value\n          .replace(\n            /\\s+/g,\n            " ",\n          )\n          .trim();\n\n      return cleaned\n        ? cleaned.slice(\n            0,\n            limit,\n          )\n        : null;\n    };\n\n    const objectError =\n      error &&\n      typeof error ===\n        "object"\n        ? error as\n            Record<\n              string,\n              unknown\n            >\n        : null;\n\n    const code =\n      compact(\n        objectError?.code ??\n          (error instanceof Error\n            ? error.name\n            : null),\n        120,\n      );\n\n    const errorMessage =\n      compact(\n        objectError?.message ??\n          (error instanceof Error\n            ? error.message\n            : typeof error ===\n                "string"\n            ? error\n            : null),\n        900,\n      ) ??\n      "Unknown structuring failure";\n\n    const details =\n      compact(\n        objectError?.details,\n        600,\n      );\n\n    const hint =\n      compact(\n        objectError?.hint,\n        300,\n      );\n\n    const message =\n      [\n        \`phase=\${phase}\`,\n        code\n          ? \`code=\${code}\`\n          : null,\n        \`message=\${errorMessage}\`,\n        details\n          ? \`details=\${details}\`\n          : null,\n        hint\n          ? \`hint=\${hint}\`\n          : null,\n      ]\n        .filter(Boolean)\n        .join("; ");`,
);

fs.writeFileSync(target, source, "utf8");
console.log("PASS: live structure private error serializer hardened with phase-aware diagnostics.");
