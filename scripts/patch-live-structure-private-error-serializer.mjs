import fs from "node:fs";

const target = "supabase/functions/live-structure-intelligence/index.ts";
let source = fs.readFileSync(target, "utf8");

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

if (!source.includes('phase=${phase}')) {
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
}

if (!source.includes('"canonical_story_lookup"')) {
  replaceOnce(
    "canonical story identity resolution",
    `        selected = {\n          id:\n            crypto.randomUUID(),\n          storyKey,\n          domain:\n            eventDomain,\n          eventType:\n            eventRule.id,\n          eventLabel:\n            eventRule.label,\n          title:\n            \`${
              '${'
            }\n              primary?.name ??\n              "Global"\n            }: ${
              '${'
            }\n              eventRule.label\n            }\`,\n          summary: "",\n          primaryCountry:\n            primary?.iso3 ??\n            null,\n          primaryCountryName:\n            primary?.name ??\n            null,\n          countries:\n            geography\n              .slice(0, 6)\n              .map(\n                (x) =>\n                  x.iso3,\n              ),\n          severity: 0,\n          confidence: 0,\n          direction:\n            trend,\n          firstSeenAt:\n            seenAt,\n          lastSeenAt:\n            seenAt,\n          evidenceCount: 0,\n          evidenceRefs: [],\n          sourceDomains:\n            new Set<string>(),\n\n          sourceFamilies:\n            new Set<string>(),\n\n          clusterTokens:\n            titleTokens,\n          why:\n            eventRule.why,\n          channels:\n            eventRule.channels,\n          severityProof: {},\n          confidenceProof: {},\n          isNew: true,\n          changed: true,\n        };\n\n        events.push(\n          selected,\n        );\n\n        addIndex(\n          selected,\n        );\n\n        created++;`,
    `        const exactBatchStory =\n          events.find(\n            (event) =>\n              event.storyKey ===\n              storyKey,\n          ) ?? null;\n\n        if (exactBatchStory) {\n          selected =\n            exactBatchStory;\n\n          if (\n            !selected.isNew &&\n            !selected.changed\n          ) {\n            selected.changed =\n              true;\n            updated++;\n          }\n        } else {\n          phase =\n            "canonical_story_lookup";\n\n          const {\n            data:\n              canonicalStory,\n            error:\n              canonicalStoryError,\n          } = await db\n            .from(\n              "live_structured_events",\n            )\n            .select(\n              "id,story_key,domain,event_type,title,summary,primary_country,countries,severity,confidence,direction,first_seen_at,last_seen_at,evidence_count,evidence_refs,structured_payload",\n            )\n            .eq(\n              "story_key",\n              storyKey,\n            )\n            .maybeSingle();\n\n          if (\n            canonicalStoryError\n          ) {\n            throw\n              canonicalStoryError;\n          }\n\n          phase =\n            "structure_batch";\n\n          if (canonicalStory) {\n            const payload =\n              canonicalStory\n                  .structured_payload &&\n              typeof\n                canonicalStory\n                  .structured_payload ===\n                "object"\n                ? canonicalStory\n                    .structured_payload\n                : {};\n\n            selected = {\n              id:\n                canonicalStory.id,\n              storyKey:\n                canonicalStory\n                  .story_key,\n              domain:\n                canonicalStory.domain,\n              eventType:\n                canonicalStory\n                  .event_type,\n              eventLabel:\n                payload\n                  .event_label ??\n                canonicalStory\n                  .event_type,\n              title:\n                canonicalStory.title,\n              summary:\n                canonicalStory\n                  .summary ??\n                "",\n              primaryCountry:\n                canonicalStory\n                  .primary_country,\n              primaryCountryName:\n                payload\n                  .primary_country_name ??\n                null,\n              countries:\n                canonicalStory\n                  .countries ??\n                [],\n              severity:\n                Number(\n                  canonicalStory\n                    .severity ??\n                    0,\n                ),\n              confidence:\n                Number(\n                  canonicalStory\n                    .confidence ??\n                    0,\n                ),\n              direction:\n                canonicalStory\n                  .direction ??\n                "unknown",\n              firstSeenAt:\n                canonicalStory\n                  .first_seen_at,\n              lastSeenAt:\n                canonicalStory\n                  .last_seen_at,\n              evidenceCount:\n                Number(\n                  canonicalStory\n                    .evidence_count ??\n                    0,\n                ),\n              evidenceRefs:\n                Array.isArray(\n                  canonicalStory\n                    .evidence_refs,\n                )\n                  ? canonicalStory\n                      .evidence_refs\n                      .map(String)\n                  : [],\n              sourceDomains:\n                new Set(\n                  Array.isArray(\n                    payload\n                      .source_domains,\n                  )\n                    ? payload\n                        .source_domains\n                        .map(String)\n                    : [],\n                ),\n              sourceFamilies:\n                new Set(\n                  Array.isArray(\n                    payload\n                      .source_families,\n                  )\n                    ? payload\n                        .source_families\n                        .map(String)\n                    : Array.isArray(\n                        payload\n                          .source_domains,\n                      )\n                    ? payload\n                        .source_domains\n                        .map(\n                          (value: unknown) =>\n                            sourceFamily(\n                              String(value),\n                            ),\n                        )\n                        .filter(Boolean)\n                    : [],\n                ),\n              clusterTokens:\n                Array.isArray(\n                  payload\n                    .cluster_tokens,\n                )\n                  ? payload\n                      .cluster_tokens\n                      .map(String)\n                  : titleTokens,\n              why:\n                payload\n                  .why_it_matters ??\n                eventRule.why,\n              channels:\n                Array.isArray(\n                  payload\n                    .risk_channels,\n                )\n                  ? payload\n                      .risk_channels\n                      .map(String)\n                  : eventRule.channels,\n              severityProof:\n                payload\n                  .severity ??\n                {},\n              confidenceProof:\n                payload\n                  .confidence ??\n                {},\n              isNew: false,\n              changed: true,\n            };\n\n            events.push(\n              selected,\n            );\n\n            addIndex(\n              selected,\n            );\n\n            updated++;\n          } else {\n            selected = {\n              id:\n                crypto.randomUUID(),\n              storyKey,\n              domain:\n                eventDomain,\n              eventType:\n                eventRule.id,\n              eventLabel:\n                eventRule.label,\n              title:\n                \`${
                  '${'
                }\n                  primary?.name ??\n                  "Global"\n                }: ${
                  '${'
                }\n                  eventRule.label\n                }\`,\n              summary: "",\n              primaryCountry:\n                primary?.iso3 ??\n                null,\n              primaryCountryName:\n                primary?.name ??\n                null,\n              countries:\n                geography\n                  .slice(0, 6)\n                  .map(\n                    (x) =>\n                      x.iso3,\n                  ),\n              severity: 0,\n              confidence: 0,\n              direction:\n                trend,\n              firstSeenAt:\n                seenAt,\n              lastSeenAt:\n                seenAt,\n              evidenceCount: 0,\n              evidenceRefs: [],\n              sourceDomains:\n                new Set<string>(),\n              sourceFamilies:\n                new Set<string>(),\n              clusterTokens:\n                titleTokens,\n              why:\n                eventRule.why,\n              channels:\n                eventRule.channels,\n              severityProof: {},\n              confidenceProof: {},\n              isNew: true,\n              changed: true,\n            };\n\n            events.push(\n              selected,\n            );\n\n            addIndex(\n              selected,\n            );\n\n            created++;\n          }\n        }`,
  );
}

fs.writeFileSync(target, source, "utf8");
console.log(
  "PASS: live structure runtime patched with phase-aware diagnostics and stable canonical event identity.",
);
