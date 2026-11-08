import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { setImmediate } from 'node:timers/promises';
import { observeWallet, readWalletObservation } from './wallet-observation.ts';
import { walletErrorMessage } from './wallet-safety.ts';

const account = '0x1111111111111111111111111111111111111111';
function fixture() {
  const events = new EventEmitter();
  const state = { accounts: [account], chain: '0x1' as unknown, unavailable: false, methods: [] as string[] };
  const provider = {
    async request({ method }: { method: string }) {
      state.methods.push(method);
      if (state.unavailable) throw new Error('provider unavailable wc:private-pairing-material');
      if (method === 'eth_accounts') return state.accounts;
      if (method === 'eth_chainId') return state.chain;
      throw new Error(`Prohibited method: ${method}`);
    },
    on: (event: string, listener: (...args: unknown[]) => void) => { events.on(event, listener); },
    removeListener: (event: string, listener: (...args: unknown[]) => void) => { events.removeListener(event, listener); },
  };
  return { provider, state, events };
}

test('active account and network are read only from provider, without signing or prompting', async () => {
  const f = fixture();
  assert.deepEqual(await readWalletObservation(f.provider), { account, chainId: 1 });
  assert.deepEqual(f.state.methods, ['eth_accounts', 'eth_chainId']);
});
test('empty, malformed, zero accounts and malformed chain IDs never establish a session', async () => {
  for (const accounts of [[], ['wrong'], ['0x0000000000000000000000000000000000000000']]) {
    const f = fixture(); f.state.accounts = accounts;
    await assert.rejects(readWalletObservation(f.provider));
  }
  for (const chain of ['0x1junk', '1', '0x0', '0xffffffffffffffffff']) {
    const f = fixture(); f.state.chain = chain;
    await assert.rejects(readWalletObservation(f.provider));
  }
});
test('correct provider session validates; account switch immediately invalidates old observation', async () => {
  const f = fixture();
  const updates: { next: unknown; error: string | null }[] = [];
  const observer = observeWallet(f.provider, { account, chainId: 1 }, (next, error) => updates.push({ next, error }));
  await setImmediate();
  assert.deepEqual(updates.at(-1)?.next, { account, chainId: 1 });
  f.state.accounts = ['0x2222222222222222222222222222222222222222'];
  f.events.emit('accountsChanged', f.state.accounts);
  assert.equal(updates.at(-1)?.next, null);
  await setImmediate();
  assert.equal(updates.at(-1)?.error, null); // A normal account change is not a failed connection.
  observer.stop();
  assert.equal(f.events.listenerCount('accountsChanged'), 0);
});
test('chain switches invalidate prior provider state instead of retaining green Mainnet status', async () => {
  const f = fixture(); const updates: unknown[] = [];
  const observer = observeWallet(f.provider, { account, chainId: 1 }, next => updates.push(next));
  await setImmediate();
  f.state.chain = '0xaa36a7'; f.events.emit('chainChanged', f.state.chain);
  assert.equal(updates.at(-1), null);
  await setImmediate();
  assert.equal(updates.at(-1), null);
  observer.stop();
});
test('disconnected, deleted and expired sessions cannot be refreshed back into success', async () => {
  for (const event of ['disconnect', 'session_delete', 'session_expire']) {
    const f = fixture(); let value: unknown;
    const observer = observeWallet(f.provider, { account, chainId: 1 }, next => { value = next; });
    await setImmediate();
    assert.ok(value);
    f.events.emit(event);
    assert.equal(value, null);
    await observer.refresh();
    assert.equal(value, null);
    observer.stop();
  }
});
test('wrong cached address/network and unavailable provider fail closed', async () => {
  for (const expected of [{ account, chainId: 11155111 }, { account: '0x2222222222222222222222222222222222222222', chainId: 1 }]) {
    const f = fixture(); let value: unknown;
    const observer = observeWallet(f.provider, expected, next => { value = next; });
    await setImmediate(); assert.equal(value, null); observer.stop();
  }
  const f = fixture(); f.state.unavailable = true; let error: string | null = null;
  const observer = observeWallet(f.provider, { account, chainId: 1 }, (_next, reason) => { error = reason; });
  await setImmediate(); assert.ok(error); observer.stop();
  await assert.rejects(readWalletObservation(f.provider), e => e instanceof Error && !e.message.includes('private-pairing-material'));
});
test('a session expiring while provider reads are pending cannot publish a late success', async () => {
  const f = fixture();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const original = f.provider.request;
  f.provider.request = async args => { await gate; return original(args); };
  let value: unknown;
  const observer = observeWallet(f.provider, { account, chainId: 1 }, next => { value = next; });
  f.events.emit('session_expire'); release();
  await setImmediate();
  assert.equal(value, null);
  observer.stop();
});
test('rejected requests retain a clear no-transaction message', () => {
  assert.match(walletErrorMessage({ code: 4001 }), /declined.*No transaction was sent/);
});
test('non-standard accountChanged also invalidates cached identity without a false connection error', async () => {
  const f = fixture();
  const updates: { next: unknown; error: string | null }[] = [];
  const observer = observeWallet(f.provider, { account, chainId: 1 }, (next, error) => updates.push({ next, error }));
  await setImmediate();
  f.state.accounts = ['0x2222222222222222222222222222222222222222'];
  f.events.emit('accountChanged', f.state.accounts[0]);
  assert.equal(updates.at(-1)?.next, null);
  await setImmediate();
  assert.deepEqual(updates.at(-1), { next: null, error: null });
  observer.stop();
  for (const event of ['accountsChanged', 'accountChanged', 'chainChanged', 'disconnect', 'session_delete', 'session_expire']) {
    assert.equal(f.events.listenerCount(event), 0);
  }
});
test('stopped session cannot publish late provider reads after replacement', async () => {
  const f = fixture();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const original = f.provider.request;
  f.provider.request = async args => { await gate; return original(args); };
  const updates: unknown[] = [];
  const observer = observeWallet(f.provider, { account, chainId: 1 }, next => updates.push(next));
  observer.stop();
  release();
  await setImmediate();
  assert.deepEqual(updates, [null]);
});
test('WalletConnect numeric chain IDs are accepted just like injected hexadecimal chain IDs', async () => {
  for (const chainId of [1, 11155111]) {
    const f = fixture();
    f.state.chain = chainId;
    assert.deepEqual(await readWalletObservation(f.provider), { account, chainId });
    assert.deepEqual(f.state.methods, ['eth_accounts', 'eth_chainId']);
  }
});
test('numeric WalletConnect provider establishes a verified active observation after approval', async () => {
  const f = fixture();
  f.state.chain = 1;
  const updates: { next: unknown; error: string | null }[] = [];
  const observer = observeWallet(f.provider, { account, chainId: 1 }, (next, error) => updates.push({ next, error }));
  await setImmediate();
  assert.deepEqual(updates.at(-1), { next: { account, chainId: 1 }, error: null });
  observer.stop();
});
test('numeric chain support does not admit coercible or unsafe network values', async () => {
  for (const chain of [0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, null, true, {}, '1', '', '0x1junk']) {
    const f = fixture();
    f.state.chain = chain;
    await assert.rejects(readWalletObservation(f.provider), /valid network/);
  }
});
