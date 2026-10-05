import { Mascot } from '@/components/Shell';
export default function About() {
  return (
    <div className="max-w-3xl space-y-4">
      <Mascot size={80} />
      <h1 className="text-3xl font-bold">About EUREKA & TINAN AI</h1>
      <p className="text-slate-300">EUREKA — A Brighter Tomorrow. TINAN AI is the tokenization layer: Not Artificial Intelligence. Natural Intelligence. It helps people plan token projects and deploy contracts with their own wallets.</p>
    </div>
  );
}
