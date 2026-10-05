import type { Blueprint } from '@/lib/blueprint';
import { DISCLAIMER } from '@/lib/blueprint';

export default function BlueprintView({ b }: { b: Blueprint }) {
  const row = (k: string, v: React.ReactNode) => (
    <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-white/5 text-sm"><div className="text-slate-400">{k}</div><div className="col-span-2 break-words">{v}</div></div>
  );
  return (
    <div className="glass p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Tokenization Blueprint</h2>
        <div className="text-right" title="Technical readiness score. Not an investment score.">
          <div className="text-3xl font-bold text-cyan-300">{b.tokenizationScore}<span className="text-sm text-slate-400">/100</span></div>
          <div className="text-[10px] tracking-widest text-slate-400">TECHNICAL READINESS · NOT AN INVESTMENT SCORE</div>
        </div>
      </div>
      <div>
        {row('Project', b.projectName)}{row('Category', b.category)}{row('Description', b.description)}
        {row('Utility', b.utility)}{row('Token standard', b.tokenStandard)}
        {row('Recommended supply', b.recommendedSupply.toLocaleString())}{row('Decimals', b.decimals)}
        {row('Risk level', b.riskLevel)}{row('Verification required', b.verificationRequired ? 'Yes' : 'No')}
        {row('Blockchain', b.blockchainRecommendation)}
      </div>
      <div><h3 className="text-sm font-semibold text-violet-300">Verification items</h3>
        <ul className="list-disc ml-5 text-sm text-slate-300">{b.verificationItems.map((v) => <li key={v}>{v}</li>)}</ul></div>
      <div><h3 className="text-sm font-semibold text-amber-300">Warnings</h3>
        <ul className="list-disc ml-5 text-sm text-slate-300">{b.warnings.map((v) => <li key={v}>{v}</li>)}</ul></div>
      <p className="text-xs text-slate-400">{DISCLAIMER}</p>
    </div>
  );
}
