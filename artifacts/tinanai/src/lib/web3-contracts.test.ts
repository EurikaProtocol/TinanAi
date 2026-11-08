import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createPublicClient, custom, decodeFunctionData, encodeFunctionResult, zeroAddress, type Address, type Hex } from 'viem';
import { sepolia } from 'viem/chains';
import { tinanAiTokenAbi, tinanAiCoreAbi } from '@workspace/tinanai-contracts/abis';
import { EXPECTED_SUPPLY, loadContractConfig, readContractActivity, readContractSnapshot, saveContractConfig, validateContractConfig } from './web3-contracts.ts';
import { isSupportedWalletChain, walletErrorMessage, walletConnectionBusy } from './wallet-safety.ts';

const token = '0x1111111111111111111111111111111111111111' as Address;
const core = '0x2222222222222222222222222222222222222222' as Address;
const account = '0x3333333333333333333333333333333333333333' as Address;
const config = { chainId: 11155111 as const, tokenAddress: token, coreAddress: core };
function reader(options: { chainId?: number; noCode?: boolean; supply?: bigint; linkedToken?: Address; failLogs?: boolean } = {}) {
  const methods: string[] = [];
  const client = createPublicClient({
    chain: sepolia, transport: custom({ request: async ({ method, params }) => {
      methods.push(method);
      if (method === 'eth_chainId') return `0x${(options.chainId ?? 11155111).toString(16)}`;
      if (method === 'eth_blockNumber') return '0x1000';
      if (method === 'eth_getCode') return options.noCode ? '0x' : '0x6000';
      if (method === 'eth_getLogs') { if (options.failLogs) throw new Error('RPC history unsupported'); return []; }
      if (method === 'eth_call') {
        const call = (params as [{ to: string; data: Hex }])[0];
        if (call.to.toLowerCase() === token.toLowerCase()) {
          const { functionName } = decodeFunctionData({ abi: tinanAiTokenAbi, data: call.data });
          if (functionName === 'name') return encodeFunctionResult({ abi: tinanAiTokenAbi, functionName, result: 'TinanAi' });
          if (functionName === 'symbol') return encodeFunctionResult({ abi: tinanAiTokenAbi, functionName, result: 'TINAN' });
          if (functionName === 'decimals') return encodeFunctionResult({ abi: tinanAiTokenAbi, functionName, result: 18 });
          if (functionName === 'totalSupply') return encodeFunctionResult({ abi: tinanAiTokenAbi, functionName, result: options.supply ?? EXPECTED_SUPPLY });
          if (functionName === 'balanceOf') return encodeFunctionResult({ abi: tinanAiTokenAbi, functionName, result: 42n * 10n ** 18n });
        } else {
          const { functionName } = decodeFunctionData({ abi: tinanAiCoreAbi, data: call.data });
          if (functionName === 'token') return encodeFunctionResult({ abi: tinanAiCoreAbi, functionName, result: options.linkedToken ?? token });
          if (functionName === 'owner') return encodeFunctionResult({ abi: tinanAiCoreAbi, functionName, result: account });
          if (functionName === 'proofCount') return encodeFunctionResult({ abi: tinanAiCoreAbi, functionName, result: 2n });
        }
      }
      throw new Error(`Unexpected or forbidden RPC method: ${method}`);
    } }, { retryCount: 0 }),
  });
  return { client, methods };
}
describe('Contract observation settings', () => {
  it('rejects unsupported networks, zero/invalid addresses, and duplicate addresses', () => {
    assert.throws(() => validateContractConfig({ ...config, chainId: 31337 }));
    assert.throws(() => validateContractConfig({ ...config, tokenAddress: zeroAddress }));
    assert.throws(() => validateContractConfig({ ...config, coreAddress: 'not an address' }));
    assert.throws(() => validateContractConfig({ ...config, coreAddress: token }));
    assert.equal(validateContractConfig({ ...config, chainId: 1 }).chainId, 1);
  });
  it('starts unconfigured and keeps Mainnet and Sepolia settings separate', () => {
    let saved: string | null = null;
    const storage = { getItem: () => saved, setItem: (_: string, value: string) => { saved = value; } };
    assert.equal(loadContractConfig(storage, 11155111), null);
    saveContractConfig(storage, config);
    assert.equal(loadContractConfig(storage, 11155111)?.tokenAddress, token);
    assert.equal(loadContractConfig(storage, 1), null);
    saveContractConfig(storage, { ...config, chainId: 1 });
    assert.equal(loadContractConfig(storage, 1)?.chainId, 1);
    assert.equal(loadContractConfig(storage, 11155111)?.chainId, 11155111);
  });
});
describe('Actual ABI decoding via read-only mocked RPC', () => {
  it('reads supply, balance and Core linkage without any signing or transaction methods', async () => {
    const { client, methods } = reader();
    const result = await readContractSnapshot(client, config, account);
    assert.equal(result.verified, true);
    assert.equal(result.totalSupply, EXPECTED_SUPPLY);
    assert.equal(result.balance, 42n * 10n ** 18n);
    assert.equal(result.proofCount, 2n);
    assert.equal(result.blockNumber, 4096n);
    assert.ok(methods.every((method) => ['eth_chainId', 'eth_blockNumber', 'eth_getCode', 'eth_call'].includes(method)));
  });
  it('does not invent a disconnected wallet balance', async () => {
    assert.equal((await readContractSnapshot(reader().client, config)).balance, null);
  });
  it('stops on wrong-chain RPC or missing deployed code', async () => {
    await assert.rejects(readContractSnapshot(reader({ chainId: 1 }).client, config), /does not match/);
    await assert.rejects(readContractSnapshot(reader({ noCode: true }).client, config), /No Token bytecode/);
  });
  it('marks supply and token-link mismatches instead of calling them verified', async () => {
    const result = await readContractSnapshot(reader({ supply: 1n, linkedToken: account }).client, config);
    assert.equal(result.verified, false);
    assert.equal(result.totalSupply, 1n);
    assert.equal(result.problems.length, 2);
  });
  it('labels bounded event history and reports RPC history failures', async () => {
    const ok = await readContractActivity(reader().client, config, account);
    assert.equal(ok.toBlock - ok.fromBlock, 499n);
    assert.deepEqual(ok.items, []);
    assert.equal(ok.partial, false);
    assert.equal((await readContractActivity(reader({ failLogs: true }).client, config, account)).partial, true);
  });
});
describe('Wallet network and error safety', () => {
  it('allows retry after the modal closes while an external relay attempt remains pending', () => {
    assert.equal(walletConnectionBusy(false, 'connecting', false), false);
    assert.equal(walletConnectionBusy(false, 'connecting', true), true);
    assert.equal(walletConnectionBusy(true, 'connecting', false), true);
    assert.equal(walletConnectionBusy(false, 'disconnected', false), false);
  });
  it('accepts Ethereum/Sepolia but not unsupported chains or disconnected state', () => {
    assert.equal(isSupportedWalletChain(1), true);
    assert.equal(isSupportedWalletChain(11155111), true);
    assert.equal(isSupportedWalletChain(137), false);
    assert.equal(isSupportedWalletChain(null), false);
  });
  it('handles user rejection and redacts private pairing URIs', () => {
    assert.match(walletErrorMessage({ code: 4001 }), /declined/);
    assert.equal(walletErrorMessage(new Error('Pair wc:private-value')), 'Pair [private pairing URI]');
  });
});
