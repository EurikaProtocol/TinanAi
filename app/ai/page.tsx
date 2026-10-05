import PromptBox from '@/components/PromptBox';
import { Mascot } from '@/components/Shell';

export default function AI() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4"><Mascot size={64} /><div><h1 className="text-3xl font-bold">TINAN AI</h1>
        <p className="text-slate-400 text-sm">Not Artificial Intelligence. Natural Intelligence.</p></div></div>
      <p className="text-slate-300 text-sm">TINAN AI produces a structured tokenization blueprint. It never executes transactions and never promises profit, price or legal status.</p>
      <PromptBox />
    </div>
  );
}
