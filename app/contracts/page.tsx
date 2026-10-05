import { CHAINS } from '@/lib/chains';
import { Badge } from '@/components/Shell';

const LIST = [
  ['TokenFactory', 'Deploys EurekaToken (ERC-20) for the caller and registers it.'],
  ['EurekaToken', 'OpenZeppelin ERC-20, burnable, fixed supply minted to the creator.'],
  ['ProjectRegistry', 'Self-declared project registry (not a verification).'],
  ['DataProofRegistry', 'Timestamped hash anchoring for data proofs.'],
  ['NFTFactory', 'OpenZeppelin ERC-721 collections (UI: COMING SOON).'],
];

export default function Contracts() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Contracts</h1>
      <p className="text-sm text-slate-400">Sources in <code>contracts/</code>; compile with <code>npm run compile:contracts</code>. Unaudited — audit before mainnet use.</p>
      <div className="grid md:grid-cols-2 gap-4">{LIST.map(([n, d]) => <div key={n} className="glass p-4"><div className="font-semibold">{n}</div><div className="text-sm text-slate-400">{d}</div></div>)}</div>
      <div className="glass p-4 text-sm space-y-1"><h2 className="font-semibold">Configured addresses</h2>
        {CHAINS.map((c) => <div key={c.id}>{c.name}: TokenFactory {c.tokenFactory ? <code className="break-all">{c.tokenFactory}</code> : <Badge tone="amber">NOT DEPLOYED</Badge>}</div>)}</div>
    </div>
  );
}
