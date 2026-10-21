import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.length ? rest.join('=') : true];
}));

const config = JSON.parse(await fs.readFile(path.join(root, 'config/growth-agent.json'), 'utf8'));
const marketplace = JSON.parse(await fs.readFile(path.join(root, 'config/agent-marketplace-distribution.json'), 'utf8'));
const distribution = JSON.parse(await fs.readFile(path.join(root, 'config/auto-distribution.json'), 'utf8'));

const requestedLive = args.has('live');
const prFixture = args.has('pr-fixture');
if(prFixture && (requestedLive || process.env.GITHUB_EVENT_NAME !== 'pull_request'))
  throw new Error('Offline Growth fixture is restricted to non-live pull-request contracts');
const ownerAckEnv = config.activation?.owner_ack_env || 'GEOMACRO_GROWTH_AGENT_ACK';
const ownerAckValue = config.activation?.owner_ack_value || 'I_AUTHORIZE_COMPLIANT_ZERO_COST_GROWTH';

if (requestedLive && process.env[ownerAckEnv] !== ownerAckValue) {
  throw new Error(`Live Growth Agent requires explicit owner authorization via ${ownerAckEnv}`);
}
if (requestedLive && config.live_external_submission_enabled !== true && config.live_social_publish_enabled !== true) {
  throw new Error('Live Growth Agent requested but all live external actions remain disabled in config/growth-agent.json');
}

function targetAction(name, target) {
  const marketplaceTarget = marketplace.targets?.[name] || null;
  const automated = String(target.automation || target.mode || '').toLowerCase().includes('auto') ||
    String(target.automation || '').toLowerCase().includes('oidc');
  return {
    target: name,
    cost_class: target.cost_class,
    automation_candidate: automated,
    production_enabled: target.production_enabled === true,
    current_marketplace_status: marketplaceTarget?.status || null,
    launch_action: marketplaceTarget?.launch_action || target.mode || null,
    requires_manual_form_or_account: !automated,
  };
}

const listingQueue = Object.entries(config.free_listing_targets || {}).map(([name, target]) => targetAction(name, target));
const freeChannels = Object.entries(config.free_social_channels || {})
  .filter(([, policy]) => policy.enabled === true && policy.automation_allowed === true)
  .map(([name]) => name);

let distributionRun = null;
if (freeChannels.length) {
  const socialLiveAllowed = requestedLive && config.live_social_publish_enabled === true && distribution.live_publish_enabled === true;
  const pollArgs = [
    path.join(root, 'scripts/marketing/poll-public-early-warning.mjs'),
    `--channels=${freeChannels.filter((name) => name !== 'rss').join(',')}`,
    '--limit=5',
  ];
  if (socialLiveAllowed) pollArgs.push('--live');
  if (prFixture) pollArgs.push('--input=scripts/marketing/fixtures/sample-public-early-warning-feed.json');

  const run = spawnSync(process.execPath, pollArgs, { cwd: root, encoding: 'utf8' });
  if (run.status !== 0) {
    throw new Error(`Growth Agent distribution stage failed: ${(run.stderr || run.stdout).trim()}`);
  }
  distributionRun = JSON.parse(run.stdout);
}

const output = {
  schema_version: 'geomacro.growth-agent-run.v1',
  generated_at: new Date().toISOString(),
  mode: requestedLive ? 'live-requested' : 'shadow',
  evidence_source: prFixture ? 'SYNTHETIC_PR_FIXTURE' : 'CANONICAL_PUBLIC_FEED',
  production_readiness_verified: false,
  canonical_origin: config.canonical_origin,
  canonical_product: config.canonical_product,
  zero_cost_first: config.zero_cost_first === true,
  listing_queue: listingQueue,
  free_social_channels: freeChannels,
  social_distribution: distributionRun,
  live_external_submission_enabled: config.live_external_submission_enabled === true,
  live_social_publish_enabled: config.live_social_publish_enabled === true,
  paid_distribution_enabled: false,
  anti_spam: config.anti_spam,
  success_metrics: config.success_metrics,
  next_manual_dependencies: listingQueue
    .filter((row) => row.requires_manual_form_or_account || row.production_enabled !== true)
    .map((row) => row.target),
};

const outPath = path.resolve(root, String(args.get('out') || 'artifacts/growth-agent/latest-run.json'));
await fs.mkdir(path.dirname(outPath), { recursive: true });
await fs.writeFile(outPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(output, null, 2));
