import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL(
    '../../scripts/ingest-news.js',
    import.meta.url
  ),
  'utf8'
);

const envExample = readFileSync(
  new URL(
    '../../.env.example',
    import.meta.url
  ),
  'utf8'
);

const workflows = [
  '../../.github/workflows/auto-ingest-news.yml',
  '../../.github/workflows/dry-run-multisource-news.yml',
  '../../.github/workflows/reclassify-gri-evidence.yml',
].map((path) =>
  readFileSync(
    new URL(path, import.meta.url),
    'utf8'
  )
);

describe('Gemini classifier model resilience', () => {
  it('keeps the permanent Gemini model chain', () => {
    expect(source).toContain(
      'GEMINI_MODEL_ORDER'
    );
    expect(source).toContain(
      "'gemini-3.8-flash'"
    );
    expect(source).toContain(
      "'gemini-3.7-flash'"
    );
    expect(source).toContain(
      "'gemini-3.6-flash'"
    );
    expect(source).toContain(
      "'gemini-3.5-flash-lite'"
    );
  });

  it('preserves the actual successful model in provenance', () => {
    expect(source).toContain(
      'providerResult?.model || model'
    );
    expect(source).toContain(
      'actualModel'
    );
  });

  it('wires model order through env and workflows', () => {
    expect(envExample).toContain(
      'GEMINI_MODEL_ORDER='
    );

    for (const workflow of workflows) {
      expect(workflow).toContain(
        'GEMINI_MODEL_ORDER: ${{ vars.GEMINI_MODEL_ORDER }}'
      );
    }
  });
});
