// Read-only PR diagnostics: CodeQL SARIF result metadata, never secrets or code.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = resolve(process.env.GITHUB_WORKSPACE ?? '.', '../results/javascript.sarif');
const sarif = JSON.parse(readFileSync(file, 'utf8'));
const changed = /(?:services\/commercial-api\/src\/(?:metering|risk-api)\.mjs|scripts\/ops\/hot50-parity-proof\.mjs)/;
let count = 0;
for (const run of sarif.runs ?? []) {
  for (const finding of run.results ?? []) {
    const locations = (finding.locations ?? []).map(item => ({
      path: String(item.physicalLocation?.artifactLocation?.uri ?? ''),
      line: item.physicalLocation?.region?.startLine ?? null,
    }));
    if (!locations.some(item => changed.test(item.path))) continue;
    const rule = String(finding.ruleId ?? '');
    const meta = {
      rule,
      location: locations.filter(item => changed.test(item.path)),
      level: finding.level ?? null,
      message: String(finding.message?.text ?? '').slice(0, 160),
    };
    process.stdout.write('CODEQL_CHANGED_FILE_FINDING ' + JSON.stringify(meta) + '\n');
    count += 1;
  }
}
process.stdout.write('CODEQL_CHANGED_FILE_FINDING_COUNT ' + count + '\n');
