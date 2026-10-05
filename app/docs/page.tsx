import Link from 'next/link';

export default function Docs() {
  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-3xl font-bold">Docs</h1>
      <div className="glass p-5 space-y-2 text-sm text-slate-300">
        <p>Flow: Connect wallet → describe what to tokenize → TINAN AI blueprint → review → sign deployment → registry → dashboard.</p>
        <p>The tokenization score is a technical readiness indicator, not an investment score.</p>
        <p>TINAN AI never promises profit, predicts prices, asserts legal ownership or runs transactions. You sign every transaction.</p>
        <p>Configuration is via <code>NEXT_PUBLIC_*</code> env vars (see <code>.env.example</code>): AI API URL, RPC URLs and contract addresses per chain. Never put secrets in them.</p>
        <p>Deploy: Cloudflare Pages, build command <code>npm run build</code>, output directory <code>out</code>.</p>
        <p><Link className="text-cyan-300 underline" href="/contracts">Contracts</Link></p>
      </div>
    </div>
  );
}
