import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const mode = process.argv[2];
const args = process.argv.slice(3);
const simulationFlag = '--authorize-creation-simulation';
const option = (prefix) => args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
function requireHttpsRpc(value) {
  if (!value?.trim()) fail('Configure TINANAI_MAINNET_RPC_URL before using the Mainnet commands.');
  let url;
  try { url = new URL(value); } catch { fail('TINANAI_MAINNET_RPC_URL must be a valid HTTPS endpoint.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    fail('TINANAI_MAINNET_RPC_URL must be HTTPS and must not include embedded credentials or a fragment.');
  }
  return url.toString();
}
function isNonzeroAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/.test(value ?? '') && !/^0x0{40}$/i.test(value);
}
function validatePaymentCatalogUrl(value) {
  let url;
  try { url = new URL(value); } catch { fail('TINANAI_MAINNET_PAYMENT_CATALOG_URL must be a valid public payment-catalog endpoint.'); }
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((!localHttp && url.protocol !== 'https:') || url.username || url.password || url.hash) {
    fail('TINANAI_MAINNET_PAYMENT_CATALOG_URL must use HTTPS (HTTP is allowed only for localhost) without embedded credentials.');
  }
}
const deploymentsDir = path.resolve('deployments');
const manifestPath = path.join(deploymentsDir, 'mainnet.json');

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
const rawRpc = process.env.TINANAI_MAINNET_RPC_URL?.trim() ?? '';
const rpc = requireHttpsRpc(rawRpc);

function runCompile() {
  const result = spawnSync('pnpm', ['run', 'compile'], { stdio: 'inherit', env: process.env });
  if (result.error) fail('Could not start the contract compiler.');
  if (result.status !== 0) fail('Contract compilation failed. No wallet was connected and no transaction was submitted.');
}

function streamRedacted(stream, destination) {
  let pending = '';
  stream.on('data', (chunk) => {
    pending += chunk.toString();
    const lines = pending.split(/(?<=\n)/);
    pending = lines.pop() ?? '';
    for (const line of lines) {
      destination.write(line.replaceAll(rawRpc, '[configured Mainnet RPC URL]').replaceAll(rpc, '[configured Mainnet RPC URL]'));
    }
  });
  stream.on('end', () => {
    if (pending) destination.write(pending.replaceAll(rawRpc, '[configured Mainnet RPC URL]').replaceAll(rpc, '[configured Mainnet RPC URL]'));
  });
}

async function runHardhat(script, environment) {
  await new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['exec', 'hardhat', 'run', script, '--network', 'mainnet'], {
      stdio: ['inherit', 'pipe', 'pipe'],
      env: environment,
    });
    streamRedacted(child.stdout, process.stdout);
    streamRedacted(child.stderr, process.stderr);
    child.once('error', () => reject(new Error('Could not start the Mainnet script.')));
    child.once('close', (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`Mainnet script stopped with exit code ${code ?? 'unknown'}.`));
    });
  });
}

const environment = { ...process.env };
let verifyAddress;
if (mode === 'verify') {
  verifyAddress = option('--address=');
  if (!isNonzeroAddress(verifyAddress)) {
    fail('Usage: pnpm --filter @workspace/tinanai-contracts run verify:mainnet -- --address=0x...');
  }
} else if (mode === 'deploy') {
  if (args.some((arg) => !arg.startsWith('--known-address=') && arg !== simulationFlag)) fail('Only --known-address=0x... and the separate --authorize-creation-simulation flag are supported.');
  const suppliedAddresses = [
    option('--known-address='),
    process.env.TINANAI_MAINNET_KNOWN_TOKEN_ADDRESS,
    process.env.TINANAI_MAINNET_VERIFY_ADDRESS,
  ].filter(Boolean);
  if (new Set(suppliedAddresses.map((value) => value.toLowerCase())).size > 1) {
    fail('Conflicting known Mainnet addresses were supplied. No deployment was attempted.');
  }
  verifyAddress = suppliedAddresses[0];
  if (verifyAddress) {
    if (!isNonzeroAddress(verifyAddress)) fail('The supplied known Mainnet address is invalid. No deployment was attempted.');
    process.stdout.write('A known token address was supplied. Verifying it only; no deployment will be attempted.\n');
  } else {
    if (!args.includes(simulationFlag)) fail('STOP: creation-code simulation is disabled by default. Separately authorize --authorize-creation-simulation only after review. No compile, wallet session, estimation or transaction was started.');
    if (existsSync(manifestPath)) fail('A Mainnet deployment manifest already exists. Use verify:mainnet to inspect it; no new deployment will be attempted.');
    if (!isNonzeroAddress(process.env.TINANAI_MAINNET_AUTHORIZED_DEPLOYER)) {
      fail('Set TINANAI_MAINNET_AUTHORIZED_DEPLOYER to the separately owner-approved wallet address.');
    }
    if (!process.env.VITE_REOWN_PROJECT_ID?.trim()) fail('Set the existing public VITE_REOWN_PROJECT_ID before deployment.');
  }
} else {
  fail('Choose deploy or verify. Mainnet deployment remains opt-in and interactive.');
}

environment.TINANAI_MAINNET_VERIFY_ADDRESS = verifyAddress ?? '';
// Per-command authorization only; never set a persistent production environment toggle.
environment.TINANAI_MAINNET_SIMULATION_AUTHORIZATION = args.includes(simulationFlag)
  ? 'ALLOW_EXACT_TINANAI_CREATION_CODE_SIMULATION' : '';
if (verifyAddress) delete environment.TINANAI_MAINNET_KNOWN_TOKEN_ADDRESS;
try {
  runCompile();
  await runHardhat('scripts/deploy-mainnet.ts', environment);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'Mainnet command failed.'}\n`);
  process.exitCode = 1;
}
