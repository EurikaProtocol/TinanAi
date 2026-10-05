import Link from 'next/link';
import PromptBox from '@/components/PromptBox';
import { Mascot } from '@/components/Shell';

export default function Home() {
  return (
    <div className="space-y-10">
      <section className="text-center space-y-4">
        <div className="flex justify-center"><Mascot size={110} /></div>
        <h1 className="text-4xl md:text-6xl font-extrabold bg-gradient-to-r from-cyan-300 via-blue-400 to-violet-400 bg-clip-text text-transparent">
          WHAT DO YOU WANT TO TOKENIZE?
        </h1>
        <p className="text-slate-300">TINAN AI — Not Artificial Intelligence. Natural Intelligence.</p>
      </section>
      <div className="mx-auto max-w-2xl"><PromptBox /></div>
      <section className="grid md:grid-cols-4 gap-4 text-sm">
        {['Describe your idea', 'TINAN AI blueprint', 'Review & configure', 'Sign & deploy yourself'].map((s, i) => (
          <div key={s} className="glass p-4"><div className="text-cyan-300 font-bold">0{i + 1}</div>{s}</div>
        ))}
      </section>
      <p className="text-center text-sm"><Link className="text-cyan-300 underline" href="/docs">How it works</Link></p>
    </div>
  );
}
