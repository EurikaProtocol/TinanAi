import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
// @ts-expect-error Node's native TypeScript test runner loads source files with explicit extensions.
import {
  buildContractManifest,
  contractCreationSchema,
  createContractDraft,
  deploymentBlockReason,
  deploymentFromDraft,
  deploymentsForAccount,
  parseInitialSupply,
  readLocalDeployments,
  writeLocalDeployment,
} from './launchpad-deployment.ts';
import type { LaunchDraft } from './store.tsx';

const validDraft: LaunchDraft = {
  id: 'draft-1',
  kind: 'community',
  name: 'Sample Token',
  symbol: 'SAMP',
  description: 'A test token.',
  network: 'Ethereum',
  standard: 'ERC-20',
  supply: '1000000',
  decimals: 18,
  distribution: 'Community.',
  website: '',
  socialLinks: '',
  sourceDescription: '',
  provenance: '',
  issuer: '',
  rights: '',
  accessModel: 'public',
  metadataUri: '',
  integrityHash: '',
  status: 'Draft',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

function createStorage(initial: string | null = null) {
  let value = initial;
  return {
    storage: {
      getItem: () => value,
      setItem: (_key: string, next: string) => { value = next; },
    },
    read: () => value,
  };
}

describe('Sepolia deployment validation', () => {
  it('converts whole-token supply to 18-decimal base units', () => {
    assert.equal(parseInitialSupply('1'), 10n ** 18n);
    assert.equal(parseInitialSupply('1000000'), 1_000_000n * (10n ** 18n));
  });

  it('rejects zero, fractional, malformed, and overflowing supplies', () => {
    for (const supply of ['0', '1.5', '1e6', '', '2' + '0'.repeat(59)]) {
      assert.throws(() => parseInitialSupply(supply));
    }
  });

  it('allows only Ethereum-compatible drafts with 18 decimals', () => {
    assert.equal(deploymentBlockReason(validDraft), null);
    assert.match(deploymentBlockReason({ ...validDraft, network: 'Solana', standard: 'SPL Token' }) ?? '', /Sepolia-only/i);
    assert.match(deploymentBlockReason({ ...validDraft, decimals: 6 }) ?? '', /18 decimals/i);
  });

  it('builds a deployment artifact with the expected ERC-20 and optional controls', () => {
    const artifact = JSON.parse(readFileSync(new URL('../generated/tinan-token.json', import.meta.url), 'utf8')) as {
      abi: { type: string; name?: string; inputs?: { name?: string }[] }[];
      bytecode: string;
      compilerVersion: string;
    };
    const functions = new Set(artifact.abi.filter((entry) => entry.type === 'function').map((entry) => entry.name));
    assert.ok(artifact.bytecode.startsWith('0x') && artifact.bytecode.length > 2);
    assert.match(artifact.compilerVersion, /^0\.8\./);
    for (const name of ['name', 'symbol', 'decimals', 'totalSupply', 'owner', 'mintingEnabled', 'burningEnabled', 'mint', 'burn']) {
      assert.ok(functions.has(name), `missing ${name} from compiled token ABI`);
    }
    const constructor = artifact.abi.find((entry) => entry.type === 'constructor');
    assert.deepEqual(constructor?.inputs?.map((input) => input.name), [
      'name_',
      'symbol_',
      'initialSupply_',
      'owner_',
      'mintingEnabled_',
      'burningEnabled_',
    ]);
  });
});

describe('local deployment history', () => {
  it('stores and filters deployments by the wallet account', () => {
    const memory = createStorage();
    const record = deploymentFromDraft(
      validDraft,
      '0x1111111111111111111111111111111111111111',
      `0x${'a'.repeat(64)}`,
      { id: 'deployment-1', createdAt: '2026-11-01T00:00:00.000Z', mintable: false, burnable: true },
    );
    const saved = writeLocalDeployment(record, memory.storage);
    assert.equal(saved.error, null);
    assert.equal(saved.records.length, 1);
    assert.equal(deploymentsForAccount(saved.records, '0x1111111111111111111111111111111111111111').length, 1);
    assert.equal(deploymentsForAccount(saved.records, '0x2222222222222222222222222222222222222222').length, 0);
    assert.equal(readLocalDeployments(memory.storage).records[0].txHash, record.txHash);
  });

  it('keeps invalid browser data intact instead of overwriting it', () => {
    const corrupted = createStorage('{not json');
    const loaded = readLocalDeployments(corrupted.storage);
    assert.ok(loaded.error);
    assert.equal(corrupted.read(), '{not json');
    const record = deploymentFromDraft(
      validDraft,
      '0x1111111111111111111111111111111111111111',
      `0x${'b'.repeat(64)}`,
      { id: 'deployment-2', createdAt: '2026-11-01T00:00:00.000Z', mintable: false, burnable: false },
    );
    assert.ok(writeLocalDeployment(record, corrupted.storage).error);
    assert.equal(corrupted.read(), '{not json');
  });
});

describe('Contract Studio preparation', () => {
  const input = { name: 'TINANAI Example', symbol: 'TNEX', supply: '1250000', description: '', mintable: false, burnable: false };
  const owner = '0x1111111111111111111111111111111111111111';
  const prepare = (overrides = {}) => createContractDraft({ ...input, ...overrides }, 'studio-1', '2026-11-06T00:00:00.000Z');

  it('normalizes parameters and defaults optional capabilities off', () => {
    const parsed = contractCreationSchema.parse({ name: ' Example ', symbol: ' ex ', supply: ' 100 ' });
    assert.equal(parsed.name, 'Example');
    assert.equal(parsed.symbol, 'EX');
    assert.equal(parsed.supply, '100');
    assert.equal(parsed.mintable, false);
    assert.equal(parsed.burnable, false);
  });

  it('rejects invalid names, symbols and supplies including uint256 overflow', () => {
    for (const overrides of [{ name: '' }, { symbol: '!' }, { supply: '0' }, { supply: '-1' }, { supply: '1.5' }, { supply: '1e9' }, { supply: '9'.repeat(60) }]) {
      assert.equal(contractCreationSchema.safeParse({ ...input, ...overrides }).success, false);
    }
  });

  it('creates a compatible draft retaining both capability choices', () => {
    const draft = prepare({ mintable: true, burnable: true });
    assert.equal(draft.standard, 'ERC-20');
    assert.equal(draft.network, 'Ethereum');
    assert.equal(draft.decimals, 18);
    assert.equal(draft.status, 'Draft');
    assert.equal(draft.mintable, true);
    assert.equal(draft.burnable, true);
    assert.equal(deploymentBlockReason(draft), null);
  });

  it('never invents an owner or deployed address when preparing without a wallet', () => {
    const manifest = buildContractManifest(prepare(), null);
    assert.equal(manifest.chainId, 11155111);
    assert.equal(manifest.contractAddress, null);
    assert.equal(manifest.transactionHash, null);
    assert.equal(manifest.parameters.owner, null);
    assert.equal(manifest.constructorArguments, null);
    assert.equal(manifest.requiresConnectedOwner, true);
    assert.equal(manifest.platform.officialPlatformToken, false);
  });

  it('exports the exact constructor ordering with supply converted using integers', () => {
    const manifest = buildContractManifest(prepare({ burnable: true }), owner);
    assert.deepEqual(manifest.constructorArguments, ['TINANAI Example', 'TNEX', '1250000000000000000000000', owner, false, true]);
    assert.equal(manifest.requiresConnectedOwner, false);
    assert.doesNotThrow(() => JSON.stringify(manifest));
  });

  it('rejects a zero owner and non-Sepolia-compatible draft settings', () => {
    assert.throws(() => buildContractManifest(prepare(), `0x${'0'.repeat(40)}`), /nonzero/);
    assert.throws(() => buildContractManifest({ ...prepare(), network: 'Base' }, owner), /Sepolia-only/);
    assert.throws(() => buildContractManifest({ ...prepare(), decimals: 6 }, owner), /18 decimals/);
  });

  it('exports the actual source and all compiler dependencies with licensing', () => {
    const build = JSON.parse(readFileSync(new URL('../generated/tinan-token-build.json', import.meta.url), 'utf8'));
    const source = readFileSync(new URL('../../contracts/TinanToken.sol', import.meta.url), 'utf8');
    assert.equal(build.standardInput.sources['TinanToken.sol'].content, source);
    assert.ok(build.standardInput.sources['@openzeppelin/contracts/token/ERC20/ERC20.sol']);
    assert.ok(build.standardInput.sources['@openzeppelin/contracts/access/Ownable.sol']);
    assert.deepEqual(build.standardInput.settings.optimizer, { enabled: true, runs: 200 });
    assert.match(build.licenses.openzeppelin, /Permission is hereby granted/);
    assert.match(build.dependencies.openzeppelinContracts, /^5\./);
  });
});
