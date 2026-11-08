import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { keccak256 } from 'viem';
import {
  HISTORICAL_TINAN_ADDRESSES, NEW_MAINNET_TARGET_ID, NEW_MAINNET_DECLARATION,
  NEW_TINAN_SOURCE_SHA256, NEW_TINAN_CREATION_HASH, NEW_TINAN_RUNTIME_HASH,
  assertNewMainnetIdentity, assertCreationSimulationAuthorized, isConfirmedHistoricalRecord,
} from '../src/mainnet-identity.ts';
import { tokenArtifact } from '../src/generated-token-artifact.ts';

test('reviewed new-token identity matches existing source and exported bytes without compilation', () => {
  const source = readFileSync(new URL('../contracts/TinanAiToken.sol', import.meta.url));
  assertNewMainnetIdentity(createHash('sha256').update(source).digest('hex'), keccak256(tokenArtifact.bytecode), keccak256(tokenArtifact.deployedBytecode));
  for (const hashes of [
    ['bad', NEW_TINAN_CREATION_HASH, NEW_TINAN_RUNTIME_HASH],
    [NEW_TINAN_SOURCE_SHA256, 'bad', NEW_TINAN_RUNTIME_HASH],
    [NEW_TINAN_SOURCE_SHA256, NEW_TINAN_CREATION_HASH, 'bad'],
  ]) assert.throws(() => assertNewMainnetIdentity(...hashes as [string, string, string]));
});
test('new declaration binds exact source/runtime identity and never denies historical contracts exist', () => {
  assert.ok(NEW_MAINNET_DECLARATION.includes(NEW_TINAN_SOURCE_SHA256));
  assert.ok(NEW_MAINNET_DECLARATION.includes(NEW_TINAN_RUNTIME_HASH));
  assert.match(NEW_MAINNET_DECLARATION, /NEW SEPARATE TinanAiToken/);
  assert.ok(!NEW_MAINNET_DECLARATION.includes('NO TINAN TOKEN DEPLOYMENT EXISTS'));
  assert.ok(!HISTORICAL_TINAN_ADDRESSES.some(address => NEW_MAINNET_TARGET_ID.includes(address)));
});
test('confirmed historical records stay separate; uncertain, duplicate-target and conflicting records block', () => {
  for (const address of HISTORICAL_TINAN_ADDRESSES) {
    assert.equal(isConfirmedHistoricalRecord({ status: 'confirmed', contractAddress: address }), true);
    for (const status of ['prepared', 'submitted', 'submission-uncertain', 'reverted', undefined]) {
      assert.equal(isConfirmedHistoricalRecord({ status, contractAddress: address }), false);
    }
    assert.equal(isConfirmedHistoricalRecord({ status: 'confirmed', contractAddress: address, targetId: NEW_MAINNET_TARGET_ID }), false);
    assert.equal(isConfirmedHistoricalRecord({ status: 'confirmed', contractAddress: address, runtimeBytecodeHash: NEW_TINAN_RUNTIME_HASH }), false);
  }
  assert.equal(isConfirmedHistoricalRecord({ status: 'confirmed', tokenAddress: HISTORICAL_TINAN_ADDRESSES[0], contractAddress: HISTORICAL_TINAN_ADDRESSES[1] }), false);
  assert.equal(isConfirmedHistoricalRecord({ status: 'confirmed', contractAddress: '0x3333333333333333333333333333333333333333' }), false);
  assert.equal(isConfirmedHistoricalRecord(null), false);
});
test('creation simulation is disabled by default; this test never calls any estimate/simulation method', () => {
  for (const authorization of [undefined, '', 'true', '1', 'DEPLOY']) assert.throws(() => assertCreationSimulationAuthorized(authorization), /disabled/);
});
test('CLI preserves locks/journals, no longer fetches payment catalog, and requires separate simulation opt-in', () => {
  const flow = readFileSync(new URL('../scripts/deploy-mainnet.ts', import.meta.url), 'utf8');
  assert.ok(!flow.includes('readConfiguredPaymentCatalog'));
  assert.ok(!flow.includes('NO TINAN TOKEN DEPLOYMENT EXISTS'));
  for (const guard of ['assertNoRecordedMainnetDeployment', 'acquireMainnetDeploymentLock', 'submission-uncertain', 'targetId: NEW_MAINNET_TARGET_ID', 'writeManifest(preparedJournal)']) assert.ok(flow.includes(guard));
  assert.ok(flow.indexOf('assertCreationSimulationAuthorized(process.env.') < flow.indexOf('await connectMainnetWallet'));
  const wrapper = readFileSync(new URL('../scripts/mainnet-command.mjs', import.meta.url), 'utf8');
  assert.ok(wrapper.indexOf('if (!args.includes(simulationFlag))') < wrapper.lastIndexOf('runCompile();'));
});
