import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defaultDataProject, dataProjectInputSchema, dataProjectStorageKey, readDataProjects, reviewDataProject, writeDataProjects } from './data-token-projects.ts';

const valid = { ...defaultDataProject, name: 'Dataset access', symbol: 'DATA' };
describe('Data token projects are offchain designs', () => {
  it('validates basic ERC20 drafts and exposes no deployable transaction', () => {
    const result = reviewDataProject(valid, 11155111);
    assert.equal(result.baseUnits, '1000000000000000000000000');
    assert.equal(result.canDeploy, false);
    assert.equal(result.status, 'blocked');
    assert.equal(result.factoryAddress, null);
    assert.equal(result.calldata, null);
    assert.equal(result.gasEstimate, null);
    assert.match(result.reason, /Core only registers proofs/);
  });
  it('rejects invalid amounts and decimals without throwing from safeParse', () => {
    for (const supply of ['0', '-1', '1.5', 'abc', '9'.repeat(78)]) assert.equal(dataProjectInputSchema.safeParse({ ...valid, supply }).success, false);
    for (const decimals of [-1, 19, 1.5]) assert.equal(dataProjectInputSchema.safeParse({ ...valid, decimals }).success, false);
  });
  it('requires zero decimals for ERC1155 editions', () => {
    assert.equal(dataProjectInputSchema.safeParse({ ...valid, standard: 'ERC-1155' }).success, false);
    assert.equal(dataProjectInputSchema.safeParse({ ...valid, standard: 'ERC-1155', decimals: 0 }).success, true);
  });
  it('requires recipients and bounds royalty/reward rules', () => {
    assert.equal(dataProjectInputSchema.safeParse({ ...valid, royaltyBps: 500 }).success, false);
    assert.equal(dataProjectInputSchema.safeParse({ ...valid, rewardBps: 10001 }).success, false);
    assert.equal(dataProjectInputSchema.safeParse({ ...valid, royaltyBps: 500, royaltyRecipient: '0x1111111111111111111111111111111111111111' }).success, true);
  });
  it('validates public metadata, allowlists and custom usage terms', () => {
    assert.equal(dataProjectInputSchema.safeParse({ ...valid, metadataUri: 'javascript:alert(1)' }).success, false);
    assert.equal(dataProjectInputSchema.safeParse({ ...valid, access: 'allowlist', allowlist: 'invalid' }).success, false);
    assert.equal(dataProjectInputSchema.safeParse({ ...valid, usage: 'custom', usageTerms: '' }).success, false);
  });
  it('round-trips projects in wallet-separated browser storage, including delete', () => {
    const map = new Map<string, string>();
    const storage = { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => { map.set(key, value); } };
    const project = { id: 'test-draft', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), input: valid };
    writeDataProjects(storage, [project], '0xAAA');
    assert.equal(readDataProjects(storage, '0xaaa')[0].input.name, valid.name);
    assert.deepEqual(readDataProjects(storage, '0xBBB'), []);
    assert.deepEqual(readDataProjects(storage), []);
    assert.notEqual(dataProjectStorageKey('0xaaa'), dataProjectStorageKey());
    writeDataProjects(storage, [], '0xaaa');
    assert.deepEqual(readDataProjects(storage, '0xAAA'), []);
  });
  it('does not silently replace corrupt stored records', () => {
    assert.throws(() => readDataProjects({ getItem: () => '{invalid' }));
  });
});
