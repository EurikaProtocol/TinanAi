import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'wouter';
import { Ban, CheckCircle2, Database, Download, FilePlus2, Pencil, ShieldOff, Trash2 } from 'lucide-react';
import { Badge, Btn, Card, ErrorNote, Field, Input, Modal, PageHeader, Select, Textarea } from '@/components/kit';
import { useDataProjects } from '@/lib/use-data-projects';
import { dataProjectInputSchema, defaultDataProject, reviewDataProject, type DataProject, type DataProjectInput } from '@/lib/data-token-projects';
import { cn, download, slug } from '@/lib/helpers';

type Review = ReturnType<typeof reviewDataProject>;

export default function DataTokenization() {
  const hook = useDataProjects();
  useEffect(() => { document.title = 'Data tokenization studio · TINANAI'; document.querySelector('meta[name="description"]')?.setAttribute('content', 'Design and review offchain data-token proposals. No transactions or deployments.'); }, []);
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8" data-testid="page-data-tokenization">
      <PageHeader eyebrow="Design review · offchain" title="Data tokenization studio" desc="Draft how a dataset could be tokenized, then review it. Nothing is deployed, signed or sent; rights and reward rules are proposals, not enforced onchain." />
      <Editor key={hook.scope} {...hook} />
    </div>
  );
}

function Editor({ projects, error, wallet, saveProject, deleteProject }: ReturnType<typeof useDataProjects>) {
  const [form, setForm] = useState<DataProjectInput>(defaultDataProject);
  const [selected, setSelected] = useState<string | null>(null);
  const [chain, setChain] = useState<number>(11155111);
  const [review, setReview] = useState<Review | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<DataProject | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const parsed = useMemo(() => dataProjectInputSchema.safeParse(form), [form]);
  const issues = useMemo(() => {
    const m: Record<string, string> = {};
    if (!parsed.success) for (const i of parsed.error.issues) { const k = i.path.join('.') || 'form'; m[k] ??= i.message; }
    return m;
  }, [parsed]);
  const set = <K extends keyof DataProjectInput>(k: K, v: DataProjectInput[K]) => { setForm((f) => { const n = { ...f, [k]: v }; if (n.standard === 'ERC-1155') n.decimals = 0; return n; }); setReview(null); setReviewError(null); };
  const note = (m: string) => { setFlash(m); setTimeout(() => setFlash(null), 2000); };
  const err = (k: string) => touched && issues[k] ? <span role="alert" className="block text-xs text-destructive" data-testid={`error-${k}`}>{k}: {issues[k]}</span> : null;

  const reset = () => { setForm(defaultDataProject); setSelected(null); setReview(null); setReviewError(null); setTouched(false); };
  const submit = (e: FormEvent) => {
    e.preventDefault(); setTouched(true);
    if (!parsed.success) return;
    const p = saveProject(form, selected ?? undefined);
    if (p) { setSelected(p.id); note(selected ? 'Project updated' : 'Project saved'); }
  };
  const runReview = () => {
    setTouched(true); setReview(null); setReviewError(null);
    try { setReview(reviewDataProject(form, chain)); } catch (e) { setReviewError(e instanceof Error && !e.message.startsWith('[') ? e.message : 'Fix the highlighted fields before review.'); }
  };
  const exportJson = () => {
    const blob = JSON.stringify({ kind: 'tinanai.data-token-proposal', status: 'offchain-design', chainId: chain, input: form }, null, 2);
    download(`${slug(form.name || 'data-project')}.json`, blob, 'application/json');
  };
  const pct = (bps: number) => (bps / 100).toFixed(2);
  const scopeLabel = wallet.account ? `${wallet.account.slice(0, 6)}…${wallet.account.slice(-4)}` : 'Guest';

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)_minmax(0,22rem)]">
      <aside className="space-y-3" aria-label="Saved projects">
        <div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">Projects · {scopeLabel}</p><Badge tone="mute">{projects.length}</Badge></div>
        <Btn size="sm" className="w-full" onClick={reset} data-testid="button-new-project"><FilePlus2 className="h-3.5 w-3.5" /> New project</Btn>
        {projects.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground" data-testid="status-projects-empty"><Database className="mx-auto mb-2 h-5 w-5 text-primary/70" />No saved projects for this {wallet.account ? 'wallet' : 'guest session'} in this browser.</div>
        ) : (
          <ul className="space-y-1.5">
            {projects.map((p) => (
              <li key={p.id} className={cn('group flex items-center gap-1 rounded-lg border px-3 py-2 transition', selected === p.id ? 'border-primary/60 bg-primary/5' : 'border-border hover:border-primary/30')} data-testid={`card-project-${p.id}`}>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setForm(p.input); setSelected(p.id); setReview(null); setReviewError(null); setTouched(false); }} data-testid={`button-select-project-${p.id}`}>
                  <span className="block truncate text-sm font-semibold">{p.input.name}</span>
                  <span className="block font-mono text-[10px] text-muted-foreground">{p.input.symbol} · {p.input.standard}</span>
                </button>
                <button type="button" aria-label={`Delete ${p.input.name}`} onClick={() => setConfirm(p)} className="rounded p-1 text-muted-foreground hover:text-destructive" data-testid={`button-delete-project-${p.id}`}><Trash2 className="h-3.5 w-3.5" /></button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] leading-relaxed text-muted-foreground">Stored only in this browser, separated by wallet. Not synced across devices and not private from anyone using this browser.</p>
      </aside>

      <Card className="min-w-0">
        <form onSubmit={submit} noValidate className="space-y-4" aria-label="Data token project">
          <div className="flex items-center gap-2"><p className="flex-1 text-sm font-semibold">{selected ? <><Pencil className="mr-1.5 inline h-3.5 w-3.5" />Editing project</> : 'New project'}</p>{flash && <span className="flex items-center gap-1 text-xs text-emerald-400 animate-in fade-in" role="status" data-testid="status-saved"><CheckCircle2 className="h-3.5 w-3.5" />{flash}</span>}</div>
          {error && <ErrorNote message={error} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Standard"><Select value={form.standard} onChange={(e) => set('standard', e.target.value as DataProjectInput['standard'])} data-testid="select-standard"><option value="ERC-20">ERC-20 (fungible)</option><option value="ERC-1155">ERC-1155 (editions)</option></Select></Field>
            <div><Field label="Name"><Input value={form.name} maxLength={64} onChange={(e) => set('name', e.target.value)} data-testid="input-name" aria-invalid={touched && !!issues.name} /></Field>{err('name')}</div>
            <div><Field label="Symbol" hint="2-12 uppercase letters or digits."><Input value={form.symbol} maxLength={12} className="font-mono" onChange={(e) => set('symbol', e.target.value.toUpperCase())} data-testid="input-symbol" aria-invalid={touched && !!issues.symbol} /></Field>{err('symbol')}</div>
            <div><Field label="Supply (whole units)"><Input value={form.supply} inputMode="numeric" className="font-mono" onChange={(e) => set('supply', e.target.value.replace(/\s/g, ''))} data-testid="input-supply" /></Field>{err('supply')}</div>
            <div><Field label="Decimals" hint={form.standard === 'ERC-1155' ? 'Fixed at 0 for ERC-1155.' : '0-18'}><Input type="number" min={0} max={18} value={form.decimals} disabled={form.standard === 'ERC-1155'} onChange={(e) => set('decimals', Number(e.target.value))} data-testid="input-decimals" /></Field>{err('decimals')}</div>
            <div><Field label="Metadata URI (optional)" hint="https://, ipfs:// or ar://"><Input value={form.metadataUri} onChange={(e) => set('metadataUri', e.target.value)} className="font-mono text-xs" data-testid="input-metadata-uri" /></Field>{err('metadataUri')}</div>
          </div>
          <div><Field label="Description"><Textarea rows={3} maxLength={2000} value={form.description} onChange={(e) => set('description', e.target.value)} data-testid="input-description" /></Field>{err('description')}</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Access"><Select value={form.access} onChange={(e) => set('access', e.target.value as DataProjectInput['access'])} data-testid="select-access"><option value="public">Public</option><option value="holders">Token holders</option><option value="allowlist">Allowlist</option></Select></Field>
            <Field label="Usage rights"><Select value={form.usage} onChange={(e) => set('usage', e.target.value as DataProjectInput['usage'])} data-testid="select-usage"><option value="read-only">Read-only</option><option value="commercial">Commercial</option><option value="custom">Custom</option></Select></Field>
          </div>
          {form.access === 'allowlist' && <div><Field label="Allowlist" hint="1-100 addresses, separated by spaces, commas or new lines."><Textarea rows={3} value={form.allowlist} onChange={(e) => set('allowlist', e.target.value)} className="font-mono text-xs" data-testid="input-allowlist" /></Field>{err('allowlist')}</div>}
          <div><Field label={form.usage === 'custom' ? 'Usage terms (required)' : 'Usage terms (optional)'}><Textarea rows={2} maxLength={2000} value={form.usageTerms} onChange={(e) => set('usageTerms', e.target.value)} data-testid="input-usage-terms" /></Field>{err('usageTerms')}</div>
          <div className="grid gap-4 sm:grid-cols-2">
            {(['royalty', 'reward'] as const).map((k) => (
              <fieldset key={k} className="space-y-3 rounded-lg border border-border p-3">
                <legend className="px-1 text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">{k === 'royalty' ? 'Royalty (proposed)' : 'Contributor reward (proposed)'}</legend>
                <div><Field label="Basis points" hint={`${pct(form[`${k}Bps`])}% · 100 bps = 1%`}><Input type="number" min={0} max={10000} step={1} value={form[`${k}Bps`]} onChange={(e) => set(`${k}Bps`, Math.trunc(Number(e.target.value) || 0))} data-testid={`input-${k}-bps`} /></Field>{err(`${k}Bps`)}</div>
                <div><Field label="Recipient"><Input value={form[`${k}Recipient`]} onChange={(e) => set(`${k}Recipient`, e.target.value.trim())} placeholder="0x…" className="font-mono text-xs" data-testid={`input-${k}-recipient`} /></Field>{err(`${k}Recipient`)}</div>
              </fieldset>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Btn type="submit" variant="gold" data-testid="button-save-project">{selected ? 'Update project' : 'Save project'}</Btn>
            <Btn type="button" onClick={exportJson} data-testid="button-export-json"><Download className="h-4 w-4" /> Export JSON</Btn>
            {selected && <Btn type="button" variant="ghost" onClick={reset} data-testid="button-cancel-edit">Cancel</Btn>}
          </div>
        </form>
      </Card>

      <div className="min-w-0 space-y-5">
        <Card data-testid="card-preview">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">Live preview</p>
          <p className="text-lg font-bold tracking-tight" data-testid="text-preview-name">{form.name || 'Untitled dataset'}</p>
          <p className="font-mono text-xs text-primary" data-testid="text-preview-symbol">{form.symbol || 'SYMBOL'} · {form.standard}</p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
            {[['Supply', form.supply || '-'], ['Decimals', String(form.decimals)], ['Access', form.access], ['Usage', form.usage], ['Royalty', `${pct(form.royaltyBps)}%`], ['Reward', `${pct(form.rewardBps)}%`]].map(([k, v]) => (
              <div key={k}><dt className="text-[10px] uppercase tracking-[.14em] text-muted-foreground">{k}</dt><dd className="mt-0.5 break-all font-mono" data-testid={`text-preview-${k.toLowerCase()}`}>{v}</dd></div>
            ))}
          </dl>
          <p className={cn('mt-4 text-xs', parsed.success ? 'text-emerald-400' : 'text-muted-foreground')} data-testid="status-validation">{parsed.success ? 'All fields valid' : `${Object.keys(issues).length} field(s) need attention`}</p>
        </Card>

        <Card data-testid="card-review">
          <p className="mb-3 text-sm font-semibold">Design review</p>
          <Field label="Proposed network"><Select value={chain} onChange={(e) => { setChain(Number(e.target.value)); setReview(null); }} data-testid="select-review-chain"><option value={11155111}>Sepolia testnet</option><option value={1}>Ethereum Mainnet</option></Select></Field>
          <Btn className="mt-3 w-full" onClick={runReview} data-testid="button-review">Run design review</Btn>
          {reviewError && <div className="mt-3"><ErrorNote message={reviewError} /></div>}
          {review && (
            <div className="mt-4 space-y-3 animate-in fade-in slide-in-from-bottom-1" data-testid="panel-review-result">
              <div className="flex gap-2"><Badge tone="mute">Status: {review.status}</Badge><Badge tone="mute">Offchain only</Badge></div>
              <dl className="grid gap-2 text-xs">
                <div><dt className="text-muted-foreground">Base units</dt><dd className="break-all font-mono" data-testid="text-review-base-units">{review.baseUnits}</dd></div>
                <div><dt className="text-muted-foreground">Factory</dt><dd data-testid="text-review-factory">None deployed or approved</dd></div>
                <div><dt className="text-muted-foreground">Calldata / gas estimate</dt><dd data-testid="text-review-gas">Not produced. No transaction was simulated.</dd></div>
              </dl>
              <p className="rounded-md border border-border bg-secondary/40 p-3 text-xs leading-relaxed text-muted-foreground" data-testid="text-review-reason">{review.reason}</p>
              <Btn variant="gold" className="w-full" disabled aria-disabled="true" data-testid="button-confirm-deploy"><Ban className="h-4 w-4" /> Deployment unavailable</Btn>
            </div>
          )}
        </Card>

        <div role="note" className="space-y-2 rounded-lg border border-border bg-card/40 p-4 text-xs leading-relaxed text-muted-foreground">
          <p className="flex gap-2"><ShieldOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />No wallet transactions, approvals or signatures are requested here. TinanAiCore only registers proofs and cannot mint data tokens.</p>
          <p>Need a standard ERC-20? Use the <Link href="/launchpad/contracts" className="text-primary hover:underline" data-testid="link-legacy-studio">Contract Studio</Link>. Check observed contracts on the <Link href="/contracts" className="text-primary hover:underline" data-testid="link-contracts-dashboard">dashboard</Link>.</p>
        </div>
      </div>

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title="Delete project?">
        <p className="text-sm text-muted-foreground">"{confirm?.input.name}" will be removed from this browser. This cannot be undone.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Btn variant="ghost" onClick={() => setConfirm(null)} data-testid="button-cancel-delete">Cancel</Btn>
          <Btn variant="danger" data-testid="button-confirm-delete" onClick={() => { if (confirm && deleteProject(confirm.id)) { if (selected === confirm.id) reset(); note('Project deleted'); } setConfirm(null); }}>Delete</Btn>
        </div>
      </Modal>
    </div>
  );
}
