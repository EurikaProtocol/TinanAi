import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Check, Download, Save, ShieldAlert, Sparkles, Trash2 } from 'lucide-react';
import { Badge, Btn, Card, ErrorNote, Field, Input, Markdown, PageHeader, Select, Skeleton, Textarea } from '@/components/kit';
import { cn, download, fmtDate, slug, useAssist } from '@/lib/helpers';
import { now, uid, useWorkspace, type TokenPlan } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { getCurrentLocale, LocalizedTree, translateUiText } from '@/lib/i18n';
import DocumentProofController from '@/components/document-proof-controller';

const NETWORKS: Record<string, string[]> = {
  Ethereum: ['ERC-20', 'ERC-721', 'ERC-1155'],
  Polygon: ['ERC-20', 'ERC-721', 'ERC-1155'],
  Base: ['ERC-20', 'ERC-721', 'ERC-1155'],
  Solana: ['SPL Token', 'Metaplex NFT'],
  Undecided: ['Undecided'],
};
const STEPS = ['Asset', 'Network', 'Token', 'Review'];
const init = { assetId: '', network: 'Ethereum', standard: 'ERC-20', name: '', symbol: '', supply: '1000000', decimals: '18', description: '' };

const planJson = (p: TokenPlan, assetName: string) => JSON.stringify({ notice: 'Planning document only. Nothing has been deployed on-chain.', asset: assetName, ...p }, null, 2);

export default function Tokenize() {
  const { data, upsert, remove } = useWorkspace();
  const { toast } = useToast();
  const { ask, isPending, error } = useAssist();
  const [, setLocation] = useLocation();
  const [view, setView] = useState<'plans' | 'proof'>(() =>
    new URLSearchParams(window.location.search).get('mode') === 'proof' ? 'proof' : 'plans',
  );
  const [step, setStep] = useState(0);
  const [f, setF] = useState(init);
  const [advice, setAdvice] = useState('');
  const set = (k: keyof typeof init, v: string) => setF((s) => ({ ...s, [k]: v }));
  const asset = data.assets.find((a) => a.id === f.assetId);
  const supply = Math.floor(Number(f.supply)); const dec = Math.floor(Number(f.decimals));
  const tokenOk = f.name.trim() && /^[A-Za-z0-9]{2,8}$/.test(f.symbol) && supply > 0 && dec >= 0 && dec <= 18;
  const can = [!!asset, true, !!tokenOk, true][step];

  const build = (): TokenPlan => ({ id: uid(), assetId: f.assetId, name: f.name.trim(), symbol: f.symbol.toUpperCase(), network: f.network, standard: f.standard, supply, decimals: dec, description: f.description.trim(), status: 'Planned', createdAt: now() });
  const save = () => { upsert('tokenPlans', build()); toast({ title: 'Plan saved locally' }); setF(init); setAdvice(''); setStep(0); };
  const guide = async () => {
    try {
      setAdvice(await ask({ mode: 'tokenization', prompt: `Give planning guidance (legal, compliance, tokenomics, documentation risks) for this proposed token plan. This is planning only; nothing is deployed.\nAsset: ${asset?.name} (${asset?.type}), ${asset?.description}\nToken: ${f.name} (${f.symbol.toUpperCase()}), ${f.network} / ${f.standard}, supply ${supply}, decimals ${dec}\nPurpose: ${f.description}` }));
    } catch { /* shown */ }
  };

  return (
    <LocalizedTree>
    <div>
      <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Tokenization tools">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'plans'}
          onClick={() => { setView('plans'); setLocation('/tokenize'); }}
          data-testid="tab-token-plans"
          className={cn('rounded-lg border px-4 py-2 text-xs font-semibold transition', view === 'plans' ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground')}
        >
          Token plans
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'proof'}
          onClick={() => { setView('proof'); setLocation('/tokenize?mode=proof'); }}
          data-testid="tab-document-proof"
          className={cn('rounded-lg border px-4 py-2 text-xs font-semibold transition', view === 'proof' ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground')}
        >
          Document proof
        </button>
      </div>
      {view === 'proof' ? <DocumentProofController /> : <>
      <PageHeader eyebrow="Tokenization" title="Plan before you mint" desc="A planning workflow. TINANAI does not deploy contracts, connect wallets or show balances." />
      <div className="mb-6 flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-primary/90" data-testid="notice-planning">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><span>Planning only. Saved plans are browser-local notes. Seek legal and compliance advice before any real issuance.</span>
      </div>
      <ol className="mb-6 grid grid-cols-4 gap-2" data-testid="steps">
        {STEPS.map((s, i) => (
          <li key={s}><button onClick={() => i <= step && setStep(i)} data-testid={`step-${i}`} className={cn('w-full border-t-2 pt-2 text-left text-xs font-semibold uppercase tracking-wider transition', i === step ? 'border-primary text-primary' : i < step ? 'border-primary/50 text-foreground' : 'border-border text-muted-foreground')}>
            <span className="font-mono">0{i + 1}</span> <span className="hidden sm:inline">{s}</span></button></li>
        ))}
      </ol>
      <Card className="space-y-5" data-testid={`panel-step-${step}`}>
        {step === 0 && (data.assets.length === 0 ? (
          <div className="py-4 text-center"><p className="font-serif text-2xl">Pick an asset to plan around</p><p className="mt-1 text-sm text-muted-foreground">You have no assets yet.</p>
            <Link href="/assets" data-testid="link-add-asset" className="mt-4 inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">Add an asset</Link></div>
        ) : (
          <Field label="Underlying asset"><Select value={f.assetId} onChange={(e) => { set('assetId', e.target.value); const a = data.assets.find((x) => x.id === e.target.value); if (a && !f.name) set('name', a.name); }} data-testid="select-plan-asset">
            <option value="">Select an asset</option>{data.assets.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}</Select></Field>
        ))}
        {step === 1 && (<>
          <Field label="Target network" hint="A planning label only. No connection is made."><Select value={f.network} onChange={(e) => setF((s) => ({ ...s, network: e.target.value, standard: NETWORKS[e.target.value][0] }))} data-testid="select-network">{Object.keys(NETWORKS).map((n) => <option key={n}>{n}</option>)}</Select></Field>
          <Field label="Token standard"><Select value={f.standard} onChange={(e) => set('standard', e.target.value)} data-testid="select-standard">{NETWORKS[f.network].map((n) => <option key={n}>{n}</option>)}</Select></Field>
        </>)}
        {step === 2 && (<>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Token name"><Input value={f.name} onChange={(e) => set('name', e.target.value)} data-testid="input-token-name" /></Field>
            <Field label="Symbol" hint="2 to 8 letters or digits"><Input value={f.symbol} maxLength={8} onChange={(e) => set('symbol', e.target.value.toUpperCase())} data-testid="input-token-symbol" /></Field>
            <Field label="Total supply"><Input type="number" min="1" value={f.supply} onChange={(e) => set('supply', e.target.value)} data-testid="input-token-supply" /></Field>
            <Field label="Decimals" hint="0 to 18"><Input type="number" min="0" max="18" value={f.decimals} onChange={(e) => set('decimals', e.target.value)} data-testid="input-token-decimals" /></Field>
          </div>
          <Field label="Purpose and rights"><Textarea rows={4} value={f.description} onChange={(e) => set('description', e.target.value)} data-testid="input-token-description" /></Field>
        </>)}
        {step === 3 && (<>
          <dl className="grid grid-cols-2 gap-4 text-sm md:grid-cols-3" data-testid="review-summary">
            {[['Asset', asset?.name ?? '-'], ['Network', f.network], ['Standard', f.standard], ['Token', `${f.name} (${f.symbol})`], ['Supply', supply.toLocaleString(getCurrentLocale())], ['Decimals', String(dec)]].map(([k, v]) => (
              <div key={k}><dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{k}</dt><dd data-no-translate className="font-semibold">{v}</dd></div>))}
          </dl>
          {f.description && <p data-no-translate className="text-sm text-muted-foreground">{f.description}</p>}
          <div className="border-t border-border pt-4">
            <Btn onClick={guide} disabled={isPending} data-testid="button-guidance"><Sparkles className="h-4 w-4" />{isPending ? 'Thinking' : 'Get AI planning guidance'}</Btn>
            <div className="mt-4">{isPending ? <Skeleton /> : error ? <ErrorNote message={error} onRetry={guide} /> : advice && <div data-testid="text-guidance"><Markdown text={advice} /></div>}</div>
          </div>
        </>)}
        <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-4">
          <Btn onClick={() => setStep((s) => s - 1)} disabled={step === 0} data-testid="button-back">Back</Btn>
          {step < 3 ? <Btn variant="gold" onClick={() => setStep((s) => s + 1)} disabled={!can} data-testid="button-next">Continue</Btn> : (
            <div className="flex gap-2">
              <Btn onClick={() => download(`${slug(f.name)}-plan.json`, planJson(build(), asset?.name ?? ''), 'application/json')} data-testid="button-export-draft"><Download className="h-4 w-4" />Export</Btn>
              <Btn variant="gold" onClick={save} data-testid="button-save-plan"><Save className="h-4 w-4" />Save plan</Btn>
            </div>)}
        </div>
      </Card>
      <h2 className="mb-4 mt-12 font-serif text-3xl">Saved plans</h2>
      {data.tokenPlans.length === 0 ? <p className="text-sm text-muted-foreground" data-testid="text-no-plans">No plans saved yet.</p> : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.tokenPlans.map((p) => {
            const an = data.assets.find((a) => a.id === p.assetId)?.name ?? translateUiText('Removed asset', getCurrentLocale());
            return (
              <Card key={p.id} data-testid={`card-plan-${p.id}`}>
                <div className="flex items-center justify-between"><p data-no-translate className="font-serif text-2xl">{p.name} <span className="font-mono text-sm text-primary">{p.symbol}</span></p><Badge>{p.status}</Badge></div>
                <p className="mt-1 text-xs text-muted-foreground"><span data-no-translate>{an} - {p.network} / {p.standard}</span> - {p.supply.toLocaleString(getCurrentLocale())} supply - {fmtDate(p.createdAt)}</p>
                <div className="mt-3 flex gap-2">
                  <Btn size="sm" onClick={() => download(`${slug(p.name)}-plan.json`, planJson(p, an), 'application/json')} data-testid={`button-export-plan-${p.id}`}><Download className="h-3.5 w-3.5" />Export</Btn>
                  <Btn size="sm" onClick={() => upsert('tokenPlans', { ...p, status: p.status === 'Reviewed' ? 'Planned' : 'Reviewed' })} data-testid={`button-toggle-plan-${p.id}`}><Check className="h-3.5 w-3.5" />{p.status === 'Reviewed' ? 'Unmark' : 'Mark reviewed'}</Btn>
                  <Btn size="sm" variant="danger" aria-label="Delete" onClick={() => remove('tokenPlans', p.id)} data-testid={`button-delete-plan-${p.id}`}><Trash2 className="h-3.5 w-3.5" /></Btn>
                </div>
              </Card>);
          })}
        </div>
      )}
      </>}
    </div>
    </LocalizedTree>
  );
}
