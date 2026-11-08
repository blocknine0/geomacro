import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const path=".github/workflows/d1-paid-cycle-account-readonly-observation.yml";
const source=readFileSync(path,"utf8");
const inv=JSON.parse(readFileSync("config/github-workflow-inventory.v1.json","utf8"));
test("real D1 billing read-only job runs exclusively on exact protected main",()=>{
 const job=source.split("  provider-readonly:")[1];
 assert.ok(job);
 assert.match(job,/github\.repository == 'blocknine0\/geomacro'/u);
 assert.match(job,/github\.ref == 'refs\/heads\/main'/u);
 assert.match(job,/environment: production/u);
 assert.match(job,/ref: \$\{\{ github\.sha \}\}/u);
 assert.match(job,/test -f config\/d1-hotspot-v2-canary\.hold/u);
 assert.match(job,/CLOUDFLARE_BILLING_READ_TOKEN: \$\{\{ secrets\.CLOUDFLARE_BILLING_READ_TOKEN \|\| secrets\.CLOUDFLARE_API_TOKEN \}\}/u);
 assert.doesNotMatch(source,/\$\{(?!\{)/u);
});
test("account billing proof cannot mutate D1, deploy or authorize commerce",()=>{
 assert.match(source,/node scripts\/ops\/check-d1-paid-monthly-headroom\.mjs --check/u);
 assert.match(source,/17 0,6,12,18 \* \* \*/u);
 assert.match(source,/if: always\(\)/u);
 assert.doesNotMatch(source,/wrangler deploy|d1 execute|--apply|payment.*activate|continue-on-error:\s*true/iu);
 const offline=source.split("  offline-contract:")[1].split("  provider-readonly:")[0];
 assert.doesNotMatch(offline,/CLOUDFLARE_API_TOKEN|CLOUDFLARE_BILLING_READ_TOKEN/u);
 assert.equal(inv.retainedWorkflowFiles.includes(path.split("/").at(-1)),true);
});
