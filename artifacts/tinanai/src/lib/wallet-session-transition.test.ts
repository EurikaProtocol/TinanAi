import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { disconnectWalletConnectSession, closeWalletSessions, createWalletSessionTransition, walletConnectorType } from './wallet-session-transition.ts';

test('clear stale observations, await old disconnect, then open exactly one new picker', async () => {
  const calls: string[] = [];
  let release!: () => void;
  const closed = new Promise<void>(resolve => { release = resolve; });
  const session = createWalletSessionTransition(
    () => calls.push('clear account/connector/chain/balance'),
    async () => { calls.push('disconnect'); await closed; },
    busy => calls.push(`busy:${busy}`),
  );
  const first = session.run(async () => { calls.push('open picker'); });
  assert.equal(session.busy, true);
  assert.deepEqual(calls, ['busy:true', 'clear account/connector/chain/balance', 'disconnect']);
  assert.equal(await session.run(async () => { throw new Error('Duplicate pairing'); }), false);
  release();
  assert.equal(await first, true);
  assert.deepEqual(calls.slice(-2), ['open picker', 'busy:false']);
  assert.equal(session.busy, false);
});

test('failed old-session cleanup never opens a new pairing and permits a later retry', async () => {
  let opened = 0;
  let fails = true;
  const session = createWalletSessionTransition(() => {}, async () => {
    if (fails) throw new Error('disconnect failed');
  }, () => {});
  await assert.rejects(session.run(async () => { opened++; }), /disconnect failed/);
  assert.equal(opened, 0);
  assert.equal(session.busy, false);
  fails = false;
  await session.run(async () => { opened++; });
  assert.equal(opened, 1);
});

test('picker failure releases the lock; next attempt must clean up again', async () => {
  let cleanups = 0;
  const session = createWalletSessionTransition(() => {}, async () => { cleanups++; }, () => {});
  await assert.rejects(session.run(async () => { throw new Error('picker unavailable'); }));
  assert.equal(session.busy, false);
  await session.run(async () => {});
  assert.equal(cleanups, 2);
});

test('all entry points share the same gate, including disconnect and injected connect', async () => {
  let done!: () => void;
  const wait = new Promise<void>(resolve => { done = resolve; });
  const session = createWalletSessionTransition(() => {}, async () => {}, () => {});
  const first = session.run(() => wait);
  assert.equal(await session.run(async () => {}), false);
  assert.equal(await session.run(async () => {}), false);
  done();
  await first;
  assert.equal(await session.run(async () => {}), true);
});

test('WalletConnect type/id casing is normalized without relabeling injected wallets', () => {
  for (const connector of [
    { type: 'walletConnect' }, { type: 'walletconnect' },
    { type: 'custom', id: 'walletConnect' },
  ]) assert.equal(walletConnectorType(connector), 'walletConnect');
  assert.equal(walletConnectorType({ type: 'injected', id: 'walletConnect' }), 'injected');
  assert.equal(walletConnectorType({ type: 'injected', id: 'io.metamask' }), 'injected');
  assert.equal(walletConnectorType(undefined), null);
});

test('hook uses supported SDK teardown and keeps the mobile-aware picker', () => {
  const hook = readFileSync(new URL('./web3-wallet.tsx', import.meta.url), 'utf8');
  assert.ok(!hook.includes('Disconnect the current wallet session first'));
  for (const required of [
    'closeWalletSessions(', 'disconnectWalletConnectSession(', "modal.disconnect('eip155')",
    'getConnections(wagmiConfig)', 'queryClient.cancelQueries', 'queryClient.removeQueries',
    "view: 'ConnectingWalletConnectBasic'", "namespace: 'eip155'", 'generation !== providerGeneration.current',
    'modalOpenRef.current || transition.current!.busy',
  ]) assert.ok(hook.includes(required), required);
  for (const forbidden of ['signMessage(', 'signTypedData(', 'sendTransaction(', 'writeContract(', 'deployContract(', 'estimateGas(', 'localStorage.clear(']) {
    assert.ok(!hook.includes(forbidden), forbidden);
  }
});
test('SDK disconnect error cannot strand the core wallet; retry SDK after core cleanup', async () => {
  const calls: string[] = [];
  let sdkCalls = 0;
  let connected = true;
  await closeWalletSessions(async () => {
    calls.push('sdk');
    if (++sdkCalls === 1) throw new Error('Stale SDK connector');
  }, async () => { calls.push('core'); connected = false; }, () => connected);
  assert.deepEqual(calls, ['sdk', 'core', 'sdk']);
  assert.equal(connected, false);
});
test('persistent SDK failure still drains core and blocks opening another session', async () => {
  let connected = true;
  let opened = false;
  const transition = createWalletSessionTransition(() => {}, () => closeWalletSessions(
    async () => { throw new Error('wc:private-material'); },
    async () => { connected = false; },
    () => connected,
  ), () => {});
  await assert.rejects(transition.run(async () => { opened = true; }), error =>
    error instanceof Error && /could not be fully closed/.test(error.message) && !error.message.includes('private-material'));
  assert.equal(connected, false);
  assert.equal(opened, false);
  assert.equal(transition.busy, false);
});
test('remaining or failing core connections block a new pairing even if SDK reports success', async () => {
  await assert.rejects(closeWalletSessions(async () => {}, async () => {}, () => true));
  await assert.rejects(closeWalletSessions(async () => {}, async () => { throw new Error('core failed'); }, () => false));
});
test('empty WalletConnect state skips SDK disconnect instead of breaking a fresh pairing', async () => {
  let disconnects = 0;
  await disconnectWalletConnectSession(async () => ({ session: undefined, disconnect: async () => { disconnects++; } }),
    async () => { disconnects++; }, () => false);
  assert.equal(disconnects, 0);
});
test('AppKit disconnects a live session once and Universal Provider is only a fallback', async () => {
  let session: unknown = { namespaces: {} };
  let appKitCalls = 0; let providerCalls = 0;
  const provider = { get session() { return session; }, async disconnect() { providerCalls++; session = undefined; } };
  await disconnectWalletConnectSession(async () => provider,
    async () => { appKitCalls++; session = undefined; }, () => true);
  assert.deepEqual([appKitCalls, providerCalls], [1, 0]);
  session = { namespaces: {} };
  await disconnectWalletConnectSession(async () => provider, async () => { throw new Error('adapter unavailable'); }, () => true);
  assert.deepEqual([appKitCalls, providerCalls], [1, 1]);
});
test('unavailable AppKit adapter is harmless without a WalletConnect connection', async () => {
  await assert.doesNotReject(disconnectWalletConnectSession(async () => { throw new Error('No available adapters'); },
    async () => {}, () => false));
  await assert.rejects(disconnectWalletConnectSession(async () => { throw new Error('adapter not ready'); },
    async () => {}, () => true), /adapter not ready/);
});
test('modal close before account publication never tears down an approved WalletConnect session', () => {
  const hook = readFileSync(new URL('./web3-wallet.tsx', import.meta.url), 'utf8');
  const callback = hook.split('modal?.subscribeState((state) => {')[1]?.split('}), []);')[0];
  assert.ok(callback, 'AppKit state subscription exists');
  assert.ok(callback.includes('modalOpenRef.current = state.open'));
  assert.ok(callback.includes('setModalOpen(state.open)'));
  for (const forbidden of ['transition.current', 'teardown(', 'disconnect(', 'clearSession(', 'setSessionBlocked(']) {
    assert.ok(!callback.includes(forbidden), `Modal visibility must not invoke ${forbidden}`);
  }
});
