import { EXISTING_TOKEN_ADDRESS, EXISTING_TOKEN_CHAIN_ID, getChain } from '@/lib/chains';
import { Badge } from '@/components/Shell';

export default function Tokens() {
  const c = getChain(EXISTING_TOKEN_CHAIN_ID);
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Tokens</h1>
      <div className="glass p-5 space-y-2 text-sm">
        <div className="font-semibold">EUREKA (existing token)</div>
        <code className="break-all text-cyan-300">{EXISTING_TOKEN_ADDRESS}</code>
        <div className="text-slate-400">Network: {c ? c.name : 'not configured'}</div>
        {c && <a className="underline text-cyan-300" href={`${c.explorer}/token/${EXISTING_TOKEN_ADDRESS}`} target="_blank" rel="noreferrer">View on explorer</a>}
        <div><Badge tone="amber">LIVE BALANCES & ANALYTICS: COMING SOON</Badge></div>
      </div>
    </div>
  );
}
