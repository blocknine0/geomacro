import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const yaml=readFileSync(new URL("../../.github/workflows/private-global-osint-15m.yml",import.meta.url),"utf8");
test("scheduled ingest cannot be evicted from shared PR/push concurrency queue",()=>{
 assert.match(yaml,/cron:\s*"\*\/15 \* \* \* \*"/u);
 assert.match(yaml,/group:\s*\$\{\{ github\.event_name == 'schedule' && 'geomacro-osint-permanent-scheduled-intake'/u);
 assert.match(yaml,/github\.event_name == 'pull_request' && format\('geomacro-osint-ci-pr-\{0\}', github\.event\.pull_request\.number\)/u);
 assert.match(yaml,/cancel-in-progress: false/u);
 assert.match(yaml,/group: geomacro-permanent-news-publication/u);
 assert.match(yaml,/needs: \[verify, quota-admission\]/u);
 assert.match(yaml,/needs\.quota-admission\.outputs\.source_intake == 'true'/u);
 assert.match(yaml,/PHASE2I_PROVIDER_MAX_NEW_ROWS:/u);
});
