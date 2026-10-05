'use client';
import { useWallet } from '@/lib/wallet';
import { CHAINS, EXISTING_TOKEN_ADDRESS, EXISTING_TOKEN_CHAIN_ID, SOLANA_ADAPTER, getChain } from '@/lib/chains';
import { Badge } from './Shell';

export default function WalletView() {
  const w = useWallet();
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold">Wallet</h1>
      <div className="glass p-5 space-y-2 text-sm">
        {w.address ? <><div>Address: <code className="break-all">{w.address}</code></div>
          <div>Network: {getChain(w.chainId)?.name ?? `Unsupported (${w.chainId})`}</div></>
          : <button className="btn" onClick={w.connect}>Connect Wallet</button>}
        {!w.hasProvider && <p className="text-amber-300">No injected wallet detected.</p>}
        {w.error && <p className="text-red-300">{w.error}</p>}
        <p className="text-slate-400">TINAN never asks for private keys or seed phrases. Every transaction needs your explicit confirmation.</p>
      </div>
      <div className="glass p-5 text-sm space-y-2">
        <h2 className="font-semibold">Switch network</h2>
        <div className="flex gap-2 flex-wrap">{CHAINS.map((c) => <button key={c.id} className="btn-ghost" disabled={!w.address} onClick={() => w.switchChain(c.id)}>{c.name}</button>)}
          <span className="self-center"><Badge tone="amber">SOLANA: {SOLANA_ADAPTER.status}</Badge></span></div>
      </div>
      <div className="glass p-5 text-sm space-y-1">
        <h2 className="font-semibold">Existing EUREKA token</h2>
        <code className="break-all text-cyan-300">{EXISTING_TOKEN_ADDRESS}</code>
        <div className="text-slate-400">Network: {EXISTING_TOKEN_CHAIN_ID ? getChain(EXISTING_TOKEN_CHAIN_ID)?.name ?? EXISTING_TOKEN_CHAIN_ID : 'not specified (set NEXT_PUBLIC_EXISTING_TOKEN_CHAIN_ID)'}. Not redeployed by this app.</div>
      </div>
    </div>
  );
}
