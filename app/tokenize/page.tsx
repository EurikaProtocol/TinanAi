import PromptBox from '@/components/PromptBox';

export default function Tokenize() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Tokenize</h1>
      <p className="text-slate-300 text-sm">Supported: ERC-20, ERC-721, ERC-1155 (blueprint only), Data Proof; AI/data, energy-data, community, creator and knowledge projects.</p>
      <PromptBox />
    </div>
  );
}
