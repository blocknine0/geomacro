import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const filename=".github/workflows/cloudflare-r2-kv-account-readonly-observation.yml";
const source=readFileSync(filename,"utf8");
const inventory=JSON.parse(readFileSync("config/github-workflow-inventory.v1.json","utf8"));
test("real provider credentials only live in protected main-only job",()=>{
 assert.match(source,/environment: production/u);
 assert.match(source,/github\.repository == 'blocknine0\/geomacro'/u);
 assert.match(source,/github\.ref == 'refs\/heads\/main'/u);
 assert.match(source,/if: github\.event_name == 'pull_request'/u);
 const offline=source.split("  offline-contract:")[1]?.split("  account-readonly:")[0];
 assert.ok(offline);
 assert.doesNotMatch(offline,/CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID/u);
 assert.match(source,/CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/u);
 assert.match(source,/CLOUDFLARE_ACCOUNT_ID: \$\{\{ secrets\.CLOUDFLARE_ACCOUNT_ID \}\}/u);
 assert.match(source,/ref: \$\{\{ github\.sha \}\}/u);
 assert.doesNotMatch(source,/\$\{(?!\{)/u);
});
test("20-minute schedule and no data mutation or merchant activation",()=>{
 assert.match(source,/8,28,48 \* \* \* \*/u);
 assert.match(source,/test -f config\/d1-hotspot-v2-canary\.hold/u);
 assert.match(source,/production_release_authorized!==false/u);
 assert.match(source,/merchant_funds_authorized!==false/u);
 assert.doesNotMatch(source,/wrangler deploy|d1 execute|--apply|continue-on-error: true/u);
 assert.doesNotMatch(source,/GITHUB_TOKEN|permissions:\s*\n\s*contents: write/u);
 assert.match(source,/if: always\(\)/u);
 assert.ok(inventory.retainedWorkflowFiles.includes(filename.split("/").at(-1)));
});
