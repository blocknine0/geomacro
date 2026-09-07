import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL(
    '../../scripts/ingest-news.js',
    import.meta.url
  ),
  'utf8'
);

function between(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(
    endMarker,
    start + startMarker.length
  );

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  return source.slice(start, end);
}

describe('shared source discovery hardening', () => {
  it('requires a valid Guardian API payload before success telemetry', () => {
    const guardian = between(
      'async function fetchArticlesFromApis(',
      '// Remove exact duplicate URLs'
    );

    const statusCheck =
      guardian.indexOf(
        "guardianResponse?.status !== 'ok'"
      );

    const arrayCheck =
      guardian.indexOf(
        '!Array.isArray('
      );

    const successTelemetry =
      guardian.indexOf(
        "providerTelemetry('guardian', 'success')"
      );

    expect(statusCheck).toBeGreaterThanOrEqual(0);
    expect(arrayCheck).toBeGreaterThanOrEqual(0);

    expect(successTelemetry).toBeGreaterThan(
      statusCheck
    );

    expect(successTelemetry).toBeGreaterThan(
      arrayCheck
    );
  });

  it('uses GDELT relevance ranking inside the bounded discovery window', () => {
    const gdelt = between(
      'async function fetchGdeltArticles(',
      'async function fetchArticlesFromApis('
    );

    expect(gdelt).toContain(
      "sort: 'HybridRel'"
    );

    expect(gdelt).not.toContain(
      "sort: 'DateDesc'"
    );

    expect(gdelt).toContain(
      "discoveryProvider: 'gdelt'"
    );

    expect(gdelt).toContain(
      'sourceDomain'
    );
  });

  it('bounds Guardian queries per category with deterministic rotation', () => {
    expect(source).toContain(
      'GUARDIAN_QUERY_BUDGET_PER_CATEGORY'
    );

    expect(source).toContain(
      'GUARDIAN_QUERY_ROTATION_HOURS'
    );

    expect(source).toContain(
      'GUARDIAN_ROTATION_RUN_MS'
    );

    expect(source).toContain(
      'Math.ceil('
    );

    expect(source).toContain(
      'allQueries.slice('
    );
  });

  it('executes only the selected Guardian query plan', () => {
    const ingestionLoop = between(
      'let candidateArticles = [];',
      '/*\n     * Bounded GDACS'
    );

    expect(ingestionLoop).toContain(
      'guardianQueryPlan('
    );

    expect(ingestionLoop).toContain(
      'guardianPlan.queries.entries()'
    );

    expect(ingestionLoop).not.toContain(
      'category.queries.entries()'
    );
  });

  it('wires Guardian query budget into ingestion workflows', () => {
    const envExample = readFileSync(
      new URL(
        '../../.env.example',
        import.meta.url
      ),
      'utf8'
    );

    expect(envExample).toContain(
      'GUARDIAN_QUERY_BUDGET_PER_CATEGORY=10'
    );

    expect(envExample).toContain(
      'GUARDIAN_QUERY_ROTATION_HOURS=2'
    );

    for (const workflowPath of [
      '../../.github/workflows/auto-ingest-news.yml',
      '../../.github/workflows/dry-run-multisource-news.yml',
    ]) {
      const workflow = readFileSync(
        new URL(
          workflowPath,
          import.meta.url
        ),
        'utf8'
      );

      expect(workflow).toContain(
        'GUARDIAN_QUERY_BUDGET_PER_CATEGORY: ${{ vars.GUARDIAN_QUERY_BUDGET_PER_CATEGORY }}'
      );

      expect(workflow).toContain(
        'GUARDIAN_QUERY_ROTATION_HOURS: ${{ vars.GUARDIAN_QUERY_ROTATION_HOURS }}'
      );
    }
  });

});
