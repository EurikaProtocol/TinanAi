'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createPublicClient, custom, defineChain, parseEventLogs, type EIP1193Provider } from 'viem';
import { Badge } from '@/components/Shell';
import { tokenFactoryAbi } from '@/lib/abi';
import { CHAINS, getChain } from '@/lib/chains';
import type { Blueprint } from '@/lib/blueprint';
import { loadDraft, newId, saveProject } from '@/lib/projects';
import { useWallet } from '@/lib/wallet';

export default function Deploy() {
  const w = useWallet();
  const [b, setB] = useState<Blueprint | null>(null);
  const [chainKey, setChainKey] = useState(CHAINS[1].key);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ id: string; tx: string; token?: string } | null>(null);
  useEffect(() => setB(loadDraft()), []);

  const chain = CHAINS.find((c) => c.key === chainKey)!;
  if (!b) return <div className="glass p-6">No configuration. <Link className="text-cyan-300 underline" href="/tokenize">Start here</Link>.</div>;
  const deployable = b.tokenStandard === 'ERC-20' && !!chain.tokenFactory && !!b.symbol;

  async function deploy() {
    if (!b || !w.address || !chain.tokenFactory) return;
    setBusy(true);
    setStatus('');
    try {
      if (w.chainId !== chain.id) {
        await w.switchChain(chain.id);
        throw new Error(`Switch your wallet to ${chain.name} and press Deploy again.`);
      }
      const client = w.client()!;
      const vchain = defineChain({
        id: chain.id, name: chain.name, nativeCurrency: { name: chain.currency, symbol: chain.currency, decimals: 18 },
        rpcUrls: { default: { http: chain.rpcUrl ? [chain.rpcUrl] : [] } },
      });
      setStatus('Confirm the transaction in your wallet…');
      const hash = await client.writeContract({
        account: w.address as `0x${string}`, chain: vchain, address: chain.tokenFactory as `0x${string}`,
        abi: tokenFactoryAbi, functionName: 'createToken',
        args: [b.projectName, b.symbol!, b.decimals, BigInt(b.recommendedSupply), b.category, ''],
      });
      setStatus('Transaction sent. Waiting for confirmation…');
      const pub = createPublicClient({ chain: vchain, transport: custom((window as unknown as { ethereum: EIP1193Provider }).ethereum) });
      const receipt = await pub.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error('Transaction reverted.');
      const ev = parseEventLogs({ abi: tokenFactoryAbi, logs: receipt.logs, eventName: 'TokenCreated' })[0];
      const id = newId();
      saveProject({ id, createdAt: Date.now(), blueprint: b, chainId: chain.id, owner: w.address, txHash: hash,
        tokenAddress: ev?.args.token, status: 'deployed' });
      setDone({ id, tx: hash, token: ev?.args.token });
      setStatus('');
    } catch (e) {
      setStatus((e as Error).message?.slice(0, 300) || 'Failed');
    }
    setBusy(false);
  }

  function saveDraftOnly() {
    if (!b) return;
    const id = newId();
    saveProject({ id, createdAt: Date.now(), blueprint: b, owner: w.address, status: 'draft' });
    setDone({ id, tx: '' });
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <h1 className="text-3xl font-bold">Deploy</h1>
      <div className="glass p-5 space-y-3 text-sm">
        <div>{b.projectName} · {b.tokenStandard} · supply {b.recommendedSupply.toLocaleString()} · decimals {b.decimals}</div>
        <div><label className="label">Network</label>
          <select className="input" value={chainKey} onChange={(e) => setChainKey(e.target.value)}>
            {CHAINS.map((c) => <option key={c.key} value={c.key}>{c.name}{c.tokenFactory ? '' : ' (factory not configured)'}</option>)}
          </select></div>
        <div>TokenFactory: {chain.tokenFactory ? <code className="text-cyan-300 break-all">{chain.tokenFactory}</code> : <Badge tone="amber">NOT CONFIGURED — DEMO</Badge>}</div>
        <p className="text-slate-400">Deployment is a real on-chain transaction paid with your gas. Nothing is sent until you confirm it in your wallet. Test on a testnet first.</p>
        {!w.address ? <button className="btn" onClick={w.connect}>Connect Wallet</button>
          : deployable ? <button className="btn" disabled={busy} onClick={deploy}>{busy ? 'Working…' : `Sign & deploy on ${chain.name}`}</button>
          : <div className="space-y-2"><Badge tone="amber">DEMO</Badge>
              <p className="text-amber-300">{b.tokenStandard !== 'ERC-20' ? 'Only ERC-20 deployment is wired up (others COMING SOON).' : 'Set the TokenFactory address env var for this chain to enable deployment.'}</p></div>}
        <div><button className="btn-ghost" onClick={saveDraftOnly}>Save as local draft (no transaction)</button></div>
        {w.error && <p className="text-red-300">{w.error}</p>}
        {status && <p className="text-cyan-200">{status}</p>}
        {done && <div className="text-emerald-300">
          {done.tx ? 'Deployed.' : 'Draft saved.'} {done.token && <>Token: <code className="break-all">{done.token}</code> </>}
          {done.tx && getChain(chain.id) && <a className="underline" href={`${chain.explorer}/tx/${done.tx}`} target="_blank" rel="noreferrer">View tx</a>}{' '}
          <Link className="underline" href={`/project/${done.id}/`}>Open project</Link></div>}
      </div>
    </div>
  );
}
