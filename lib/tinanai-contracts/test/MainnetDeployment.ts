import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  decodeDeployData,
  erc20Abi,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { mainnet } from 'viem/chains';
import {
  assertAuthorizedDeployer,
  assertMainnetChainId,
  assertNoRecordedMainnetDeployment,
  acquireMainnetDeploymentLock,
  buildTokenOnlyCreationData,
  estimateMainnetDeployment,
  MAINNET_TOKEN_SUPPLY,
  requestTokenOnlyDeployment,
  readConfiguredPaymentCatalog,
  requireHttpsMainnetRpc,
  verifyExistingMainnetToken,
  type MainnetPreflight,
  type TokenArtifact,
} from '../scripts/mainnet-safety.js';
import { tinanAiTokenAbi } from '../src/index.js';
import { CREATION_SIMULATION_AUTHORIZATION } from '../src/mainnet-identity.js';

const account = '0x1111111111111111111111111111111111111111' as Address;
const otherAccount = '0x2222222222222222222222222222222222222222' as Address;
const tokenAddress = '0x3333333333333333333333333333333333333333' as Address;
const tokenBytecode = '0x600160005260206000f3' as Hex;
const runtimeBytecode = '0x600260005260206000f3' as Hex;
const artifact: TokenArtifact = { abi: tinanAiTokenAbi, bytecode: tokenBytecode, deployedBytecode: runtimeBytecode };
const gas: MainnetPreflight = {
  estimateGas: 500_000n,
  gasLimit: 600_000n,
  maxFeePerGas: 30_000_000_000n,
  maxPriorityFeePerGas: 2_000_000_000n,
  maximumCostWei: 18_000_000_000_000_000n,
  balanceWei: 50_000_000_000_000_000n,
};

function mainnetClient(overrides: Record<string, unknown> = {}): PublicClient {
  return {
    getChainId: async () => 1,
    estimateGas: async () => 500_000n,
    estimateFeesPerGas: async () => ({ maxFeePerGas: 30_000_000_000n, maxPriorityFeePerGas: 2_000_000_000n }),
    getBalance: async () => 50_000_000_000_000_000n,
    getBlockNumber: async () => 20_000_000n,
    getCode: async () => runtimeBytecode,
    readContract: async ({ functionName }: { functionName: string }) => ({
      name: 'TinanAi', symbol: 'TINAN', decimals: 18, totalSupply: MAINNET_TOKEN_SUPPLY,
    })[functionName],
    ...overrides,
  } as unknown as PublicClient;
}

describe('Mainnet deployment protections (no public-chain signing)', () => {
  it('accepts chain ID 1 and rejects Sepolia, local, and unexpected chains', () => {
    assert.doesNotThrow(() => assertMainnetChainId(1));
    for (const chainId of [31337, 11155111, 5, 0]) {
      assert.throws(() => assertMainnetChainId(chainId), /Wrong network/);
    }
  });

  it('requires an explicit HTTPS Mainnet RPC without exposing its URL', () => {
    assert.throws(() => requireHttpsMainnetRpc(undefined), /TINANAI_MAINNET_RPC_URL/);
    assert.throws(() => requireHttpsMainnetRpc('http://example.test/rpc'), /HTTPS/);
    assert.throws(() => requireHttpsMainnetRpc('https://user:password@example.test/rpc'), /credentials/);
    assert.equal(requireHttpsMainnetRpc('https://rpc.example.test/v1/private-path'), 'https://rpc.example.test/v1/private-path');
  });

  it('reads the configured payment registry before connecting a wallet and fails closed', async () => {
    const payload = {
      settings: { chainId: 1, tokenAddress, enabled: false },
      ready: false,
    };
    const fetcher: typeof fetch = async (input, init) => {
      assert.equal(String(input), 'https://api.example.test/api/tinanai/payments/catalog');
      assert.equal(init?.method, 'GET');
      assert.equal(init?.cache, 'no-store');
      return { ok: true, status: 200, json: async () => payload } as Response;
    };
    const settings = await readConfiguredPaymentCatalog('https://api.example.test/api/tinanai/payments/catalog', fetcher);
    assert.equal(settings.chainId, 1);
    assert.equal(settings.tokenAddress, tokenAddress);
    assert.equal(settings.enabled, false);
    assert.equal(settings.ready, false);

    await assert.rejects(readConfiguredPaymentCatalog(undefined, fetcher), /PAYMENT_CATALOG_URL/);
    await assert.rejects(readConfiguredPaymentCatalog('http://api.example.test/catalog', fetcher), /HTTPS/);
    await assert.rejects(readConfiguredPaymentCatalog('https://user:password@api.example.test/catalog', fetcher), /credentials/);
    await assert.rejects(readConfiguredPaymentCatalog('https://api.example.test/catalog', async () => { throw new Error('private transport detail'); }), /Could not safely read/);
    await assert.rejects(readConfiguredPaymentCatalog('https://api.example.test/catalog', async () => ({ ok: false, status: 503 } as Response)), /HTTP 503/);
    await assert.rejects(readConfiguredPaymentCatalog('https://api.example.test/catalog', async () => ({
      ok: true, status: 200, json: async () => ({ settings: { chainId: 1, enabled: true, tokenAddress: null }, ready: false }),
    } as Response)), /inconsistent/);
  });

  it('requires the connected wallet to exactly match the separately configured project-owner address', () => {
    assert.equal(assertAuthorizedDeployer(account, account.toLowerCase()), account);
    assert.throws(() => assertAuthorizedDeployer(undefined, account), /No wallet signer/);
    assert.throws(() => assertAuthorizedDeployer(account, undefined), /AUTHORIZED_DEPLOYER/);
    assert.throws(() => assertAuthorizedDeployer(account, otherAccount), /does not match/);
  });

  it('constructs only the existing Token creation bytecode with the deployer as initial holder', () => {
    const data = buildTokenOnlyCreationData(artifact, account);
  const decoded = decodeDeployData({ abi: tinanAiTokenAbi, bytecode: tokenBytecode, data });
    assert.equal(decoded.args?.[0], account);
  const tokenFunctionNames = tinanAiTokenAbi.filter((item) => item.type === 'function').map((item) => item.name as string);
  assert.equal(tokenFunctionNames.includes('mint'), false);
  assert.equal(tokenFunctionNames.includes('registerProof'), false);
    assert.throws(() => buildTokenOnlyCreationData({ ...artifact, bytecode: '0x' }, account), /missing/);
    assert.throws(() => buildTokenOnlyCreationData({ ...artifact, abi: erc20Abi }, account), /constructor/);
  });

  it('refuses a recorded Mainnet deployment and does not treat other chain records as Mainnet', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'tinan-mainnet-records-'));
    try {
      await writeFile(path.join(dir, 'local.json'), JSON.stringify({ chainId: 31337, tokenAddress: account }));
      await writeFile(path.join(dir, 'sepolia.json'), JSON.stringify({ chainId: 11155111, tokenAddress: account }));
      assert.doesNotThrow(() => assertNoRecordedMainnetDeployment(dir));
      await writeFile(path.join(dir, 'mainnet.json'), JSON.stringify({ chainId: 1, tokenAddress }));
      assert.throws(() => assertNoRecordedMainnetDeployment(dir), /already exists/);
      await rm(path.join(dir, 'mainnet.json'));
      await writeFile(path.join(dir, 'legacy.json'), JSON.stringify({ network: 'mainnet', tokenAddress }));
      assert.throws(() => assertNoRecordedMainnetDeployment(dir), /Mainnet record/);
      await rm(path.join(dir, 'legacy.json'));
      await writeFile(path.join(dir, 'nested.json'), JSON.stringify({ chainId: '1', token: { address: tokenAddress } }));
      assert.throws(() => assertNoRecordedMainnetDeployment(dir), /Mainnet record/);
      await rm(path.join(dir, 'nested.json'));
      await writeFile(path.join(dir, 'interrupted.json'), JSON.stringify({ network: 'Ethereum Mainnet', status: 'submission-uncertain', contractAddress: null }));
      assert.throws(() => assertNoRecordedMainnetDeployment(dir), /Reconcile/);
      await rm(path.join(dir, 'interrupted.json'));
      await writeFile(path.join(dir, 'mainnet.json.tmp'), '{}');
      assert.throws(() => assertNoRecordedMainnetDeployment(dir), /temporary deployment journal/);
      await rm(path.join(dir, 'mainnet.json.tmp'));
      await writeFile(path.join(dir, 'corrupt.json'), '{');
      assert.throws(() => assertNoRecordedMainnetDeployment(dir), /safely inspect/);
      assert.throws(() => assertNoRecordedMainnetDeployment(path.join(dir, 'missing')), /unavailable/);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it('serializes competing deployments with a lock and never auto-recovers a stale lock', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'tinan-mainnet-lock-'));
    const lockPath = path.join(dir, 'mainnet.lock');
    try {
      const release = acquireMainnetDeploymentLock(lockPath);
      assert.throws(() => acquireMainnetDeploymentLock(lockPath), /lock already exists/);
      release();
      const releaseAgain = acquireMainnetDeploymentLock(lockPath);
      releaseAgain();
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it('estimates gas and EIP-1559 maximum cost before allowing a send', async () => {
    const result = await estimateMainnetDeployment(mainnetClient(), account, tokenBytecode, CREATION_SIMULATION_AUTHORIZATION);
    assert.equal(result.estimateGas, 500_000n);
    assert.equal(result.gasLimit, 600_000n);
    assert.equal(result.maximumCostWei, 18_000_000_000_000_000n);
    assert.equal(result.balanceWei >= result.maximumCostWei, true);
    await assert.rejects(estimateMainnetDeployment(mainnetClient({ getChainId: async () => 11155111 }), account, tokenBytecode, CREATION_SIMULATION_AUTHORIZATION), /Wrong network/);
    await assert.rejects(estimateMainnetDeployment(mainnetClient({ estimateGas: async () => { throw new Error('RPC failed'); } }), account, tokenBytecode, CREATION_SIMULATION_AUTHORIZATION), /gas estimation failed/);
    await assert.rejects(estimateMainnetDeployment(mainnetClient({ estimateFeesPerGas: async () => { throw new Error('RPC failed'); } }), account, tokenBytecode, CREATION_SIMULATION_AUTHORIZATION), /fee-cap estimation failed/);
    await assert.rejects(estimateMainnetDeployment(mainnetClient({ getBalance: async () => 1n }), account, tokenBytecode, CREATION_SIMULATION_AUTHORIZATION), /Insufficient ETH/);
  });

  it('requests exactly one Token deployment and preserves wallet rejection without a recorded transaction', async () => {
    let calls = 0;
    let request: Record<string, unknown> | undefined;
    const wallet = {
      deployContract: async (value: Record<string, unknown>) => {
        calls += 1;
        request = value;
        return `0x${'12'.repeat(32)}`;
      },
    } as unknown as Pick<WalletClient, 'deployContract'>;
    const hash = await requestTokenOnlyDeployment(wallet, artifact, account, gas);
    assert.equal(hash, `0x${'12'.repeat(32)}`);
    assert.equal(calls, 1);
    assert.equal(request?.account, account);
    assert.deepEqual(request?.args, [account]);
    assert.equal(request?.chain, mainnet);
    assert.equal(request?.gas, gas.gasLimit);
    assert.equal('value' in (request ?? {}), false);

    const rejectedWallet = {
      deployContract: async () => { calls += 1; throw new Error('User rejected request'); },
    } as unknown as Pick<WalletClient, 'deployContract'>;
    await assert.rejects(requestTokenOnlyDeployment(rejectedWallet, artifact, account, gas), /rejected/);
    assert.equal(calls, 2);
  });

  it('verifies a known address only on Mainnet and requires exact runtime bytecode and token metadata', async () => {
    const verified = await verifyExistingMainnetToken(mainnetClient(), tokenAddress, runtimeBytecode);
    assert.equal(verified.address, tokenAddress);
    assert.equal(verified.chainId, 1);
    assert.equal(verified.runtimeBytecodeMatches, true);
    assert.equal(verified.metadataMatches, true);
    await assert.rejects(verifyExistingMainnetToken(mainnetClient({ getChainId: async () => 11155111 }), tokenAddress, runtimeBytecode), /Wrong network/);
    await assert.rejects(verifyExistingMainnetToken(mainnetClient({ getCode: async () => '0x' }), tokenAddress, runtimeBytecode), /no deployed code/);
    await assert.rejects(verifyExistingMainnetToken(mainnetClient({ getCode: async () => '0x1234' }), tokenAddress, runtimeBytecode), /verification failed/);
    await assert.rejects(verifyExistingMainnetToken(mainnetClient({ readContract: async () => 'wrong' }), tokenAddress, runtimeBytecode), /verification failed/);
  });
});
