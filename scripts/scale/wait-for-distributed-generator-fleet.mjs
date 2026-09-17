import process from 'node:process';

const EXPECTED_GENERATORS = 40;
const MIN_FIRE_LEAD_MS = 30_000;
const POLL_MS = 5_000;

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function safeEpoch(name) {
  const value = Number(required(name));
  if (!Number.isSafeInteger(value) || value < 1_600_000_000_000 || value > 4_000_000_000_000) {
    throw new Error(`${name} must be a valid millisecond epoch`);
  }
  return value;
}

async function listArtifacts(owner, repo, runId, token) {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/artifacts?per_page=100`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
      'user-agent': 'GeomacroDistributedFleetBarrier/1.0',
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`GitHub readiness query failed with HTTP ${response.status}`);
  const body = await response.json();
  return Array.isArray(body?.artifacts) ? body.artifacts : [];
}

async function main() {
  const token = required('GITHUB_TOKEN');
  const repository = required('GITHUB_REPOSITORY');
  const runId = required('GITHUB_RUN_ID');
  const readinessPrefix = required('RISK_GATE_DISTRIBUTED_READINESS_PREFIX');
  const barrierEpochMs = safeEpoch('RISK_GATE_DISTRIBUTED_BARRIER_EPOCH_MS');
  const [owner, repo] = repository.split('/');
  if (!owner || !repo) throw new Error('GITHUB_REPOSITORY must be owner/repo');

  while (true) {
    const now = Date.now();
    if (now >= barrierEpochMs - MIN_FIRE_LEAD_MS) {
      throw new Error('40-generator fleet did not become concurrently ready with sufficient pre-fire lead; refusing traffic');
    }

    const artifacts = await listArtifacts(owner, repo, runId, token);
    const ready = artifacts.filter((artifact) => !artifact.expired && String(artifact.name || '').startsWith(readinessPrefix));
    const shardIds = new Set();
    for (const artifact of ready) {
      const suffix = String(artifact.name).slice(readinessPrefix.length);
      if (/^(?:[0-9]|[1-3][0-9])$/.test(suffix)) shardIds.add(Number(suffix));
    }

    if (shardIds.size === EXPECTED_GENERATORS && [...Array(EXPECTED_GENERATORS).keys()].every((index) => shardIds.has(index))) {
      console.log(`PASS: all ${EXPECTED_GENERATORS} generator jobs are concurrently occupying dedicated runner slots before the barrier; traffic may remain armed for the synchronized fire time.`);
      return;
    }

    console.log(`Waiting for distributed generator fleet readiness: ${shardIds.size}/${EXPECTED_GENERATORS} active shard slots.`);
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
