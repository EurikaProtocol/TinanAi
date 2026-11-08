import { useState, type FormEvent } from 'react';
import { Link } from 'wouter';
import { ArrowRight, CheckCircle2, Download, FileCode2, Info, ShieldOff } from 'lucide-react';
import { LaunchpadFrame, PageTitle } from '@/components/launchpad-ui';
import { Badge, Btn, Card, ErrorNote, Field, Input, Textarea } from '@/components/kit';
import { useWorkspace, uid, now, type LaunchDraft } from '@/lib/store';
import { download, slug } from '@/lib/helpers';
import { useLaunchpadWallet } from '@/lib/launchpad-wallet';
import { contractCreationSchema, createContractDraft } from '@/lib/launchpad-deployment';
import { tokenSource, tokenAbiJson, compilerInputJson, compilerVersion, exportContractBundle } from '@/lib/contract-artifacts';

type FormState = { name: string; symbol: string; supply: string; description: string; mintable: boolean; burnable: boolean };
const initial: FormState = { name: '', symbol: '', supply: '', description: '', mintable: false, burnable: false };

export default function ContractStudio() {
  const workspace = useWorkspace();
  const { upsert, storageError } = workspace;
  const wallet = useLaunchpadWallet();
  const account = wallet.account ?? null;
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [draft, setDraft] = useState<LaunchDraft | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDraft(null);
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    const parsed = contractCreationSchema.safeParse({ ...form, symbol: form.symbol.trim().toUpperCase() });
    if (!parsed.success) {
      const next: Partial<Record<keyof FormState, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormState;
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      setDraft(null);
      return;
    }
    try {
      const created = createContractDraft(parsed.data, uid(), now());
      upsert('launchDrafts', created);
      setDraft(created);
      setErrors({});
    } catch (err) {
      setDraft(null);
      setSaveError(err instanceof Error ? err.message : 'The draft could not be created.');
    }
  };

  const base = draft ? slug(draft.symbol) : 'token';
  const err = (k: keyof FormState) => errors[k] && <span className="block text-xs text-destructive" role="alert" data-testid={`error-contract-${k}`}>{errors[k]}</span>;

  return (
    <LaunchpadFrame active="/launchpad/contracts">
      <PageTitle eyebrow="Contract studio" title="Generate an ERC-20 contract" description="Set your token's parameters and get a reviewed, fixed Solidity template. Nothing is deployed from this page; deployment happens only on the review page after your wallet approves it." />
      {storageError && <div className="mb-5"><ErrorNote message={storageError} /></div>}
      {saveError && <div className="mb-5"><ErrorNote message={saveError} /></div>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Card className="h-fit">
          <form onSubmit={submit} noValidate className="space-y-4" aria-label="Contract parameters">
            <Field label="Token name" hint="1 to 64 characters.">
              <Input value={form.name} maxLength={64} onChange={(e) => set('name', e.target.value)} placeholder="Harbor Reading Circle" data-testid="input-contract-name" aria-invalid={!!errors.name} />
            </Field>{err('name')}
            <Field label="Symbol" hint="2 to 12 uppercase letters or digits.">
              <Input value={form.symbol} maxLength={12} onChange={(e) => set('symbol', e.target.value.toUpperCase())} placeholder="HRC" className="font-mono" data-testid="input-contract-symbol" aria-invalid={!!errors.symbol} />
            </Field>{err('symbol')}
            <Field label="Initial supply (whole tokens)" hint="Whole number. 18 decimals are added on chain.">
              <Input value={form.supply} inputMode="numeric" onChange={(e) => set('supply', e.target.value.replace(/\s/g, ''))} placeholder="1250000" className="font-mono" data-testid="input-contract-supply" aria-invalid={!!errors.supply} />
            </Field>{err('supply')}
            <Field label="Description (optional)" hint="Stored with your local draft. Not written into the contract.">
              <Textarea rows={3} maxLength={2000} value={form.description} onChange={(e) => set('description', e.target.value)} data-testid="input-contract-description" />
            </Field>{err('description')}
            <fieldset className="space-y-2.5 rounded-lg border border-border p-3.5">
              <legend className="px-1 text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">Optional features</legend>
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]" checked={form.mintable} onChange={(e) => set('mintable', e.target.checked)} data-testid="checkbox-contract-mintable" />
                <span><strong className="font-semibold">Mintable</strong><span className="block text-xs text-muted-foreground">Only the owner can create new tokens later. There is no hard cap.</span></span>
              </label>
              <label className="flex items-start gap-3 text-sm">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]" checked={form.burnable} onChange={(e) => set('burnable', e.target.checked)} data-testid="checkbox-contract-burnable" />
                <span><strong className="font-semibold">Burnable</strong><span className="block text-xs text-muted-foreground">Holders can destroy tokens from their own balance.</span></span>
              </label>
            </fieldset>
            <Btn type="submit" variant="gold" className="w-full" data-testid="button-generate-contract"><FileCode2 className="h-4 w-4" /> Generate contract</Btn>
            <p className="text-xs leading-relaxed text-muted-foreground">Ethereum Sepolia testnet only. Mainnet deployment is not available.</p>
          </form>
        </Card>

        <div className="min-w-0 space-y-5">
          {!draft ? (
            <div className="rounded-xl border border-dashed border-border bg-card/40 px-6 py-14 text-center" data-testid="status-contract-empty">
              <div className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-full border border-border bg-secondary/60 text-muted-foreground"><FileCode2 className="h-5 w-5" /></div>
              <h2 className="font-serif text-2xl">No contract generated</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">Fill in the parameters and select Generate contract. Changing any field clears the previous result so you never review stale settings.</p>
            </div>
          ) : (
            <>
              <Card data-testid="status-contract-generated">
                <div className="flex flex-wrap items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <p className="text-sm font-semibold">{storageError ? 'Prepared in memory; browser save failed' : 'Local draft saved'}</p>
                  <Badge tone="mute">Not deployed</Badge>
                  <Badge tone="mute">No contract address</Badge>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
                  {[
                    ['Name', draft.name], ['Symbol', draft.symbol], ['Initial supply', `${draft.supply} ${draft.symbol}`],
                    ['Decimals', String(draft.decimals)], ['Standard', draft.standard], ['Network', 'Sepolia testnet'],
                    ['Mintable', draft.mintable ? 'Yes, owner only' : 'No'], ['Burnable', draft.burnable ? 'Yes, own balance' : 'No'], ['Compiler', compilerVersion],
                  ].map(([k, v]) => (
                    <div key={k} className="min-w-0"><dt className="text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">{k}</dt><dd className="mt-0.5 break-words font-mono text-xs" data-testid={`text-contract-${k.toLowerCase().replaceAll(' ', '-')}`}>{v}</dd></div>
                  ))}
                </dl>
                <p className="mt-4 rounded-md border border-border bg-secondary/40 p-3 text-xs leading-relaxed text-muted-foreground" data-testid="text-contract-owner">
                  <strong className="text-foreground">Owner:</strong>{' '}
                  {account ? <>will default to the connected account <span className="break-all font-mono text-foreground">{account}</span>, confirmed on the review page.</> : 'not chosen yet. The owner is the wallet you connect and approve with on the review page.'}
                </p>
                <Link href={`/launchpad/token/${encodeURIComponent(draft.id)}`} data-testid="link-review-contract-deployment" className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">
                  Review deployment <ArrowRight className="h-4 w-4" />
                </Link>
              </Card>

              <Card>
                <p className="mb-3 text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">Downloads</p>
                <div className="flex flex-wrap gap-2">
                  <Btn size="sm" onClick={() => download(`${base}-Token.sol`, tokenSource)} data-testid="button-download-contract-source"><Download className="h-3.5 w-3.5" /> Source</Btn>
                  <Btn size="sm" onClick={() => download(`${base}-abi.json`, tokenAbiJson, 'application/json')} data-testid="button-download-contract-abi"><Download className="h-3.5 w-3.5" /> ABI</Btn>
                  <Btn size="sm" onClick={() => download(`${base}-bundle.json`, exportContractBundle(draft, account), 'application/json')} data-testid="button-download-contract-bundle"><Download className="h-3.5 w-3.5" /> Full bundle</Btn>
                  <Btn size="sm" onClick={() => download(`${base}-compiler-input.json`, compilerInputJson, 'application/json')} data-testid="button-download-compiler-input"><Download className="h-3.5 w-3.5" /> Compiler input</Btn>
                </div>
              </Card>

              <Card className="p-0 overflow-hidden">
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                  <span className="font-mono text-xs text-muted-foreground">Token.sol</span><Badge tone="mute">{compilerVersion}</Badge>
                </div>
                <pre className="max-h-[420px] overflow-auto p-4 font-mono text-[11px] leading-relaxed text-foreground/85" data-testid="text-contract-source">{tokenSource}</pre>
                <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">This exact template is shared by every token. Your name, symbol, supply and options are passed as constructor arguments; the source is never rewritten.</p>
              </Card>
            </>
          )}

          <div className="space-y-2 rounded-lg border border-border bg-card/40 p-4 text-xs leading-relaxed text-muted-foreground" role="note">
            <p className="flex gap-2"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />Drafts are stored only in this browser. Clearing site data removes them.</p>
            <p className="flex gap-2"><ShieldOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />Compiling is not an audit. Have the contract reviewed before relying on it. This is not an official TINANAI platform token.</p>
            <p className="flex gap-2"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />A contract address exists only after a real, wallet-approved deployment on the review page.</p>
          </div>
        </div>
      </div>
    </LaunchpadFrame>
  );
}
