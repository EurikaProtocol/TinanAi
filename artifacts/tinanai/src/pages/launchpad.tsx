import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocation, useParams } from 'wouter';
import { ArrowDownToLine, ArrowLeft, ArrowRight, CircleAlert, Clock3, Database, ExternalLink, FilePlus2, ShieldAlert, Trash2, Wallet } from 'lucide-react';
import { Badge, Btn, Card, Field, Input, Select, Textarea } from '@/components/kit';
import { DraftCollection, LaunchpadFrame, PageTitle, QuietEmpty } from '@/components/launchpad-ui';
import { LaunchpadDeployPanel } from '@/components/launchpad-deploy-panel';
import { createLaunchDraft, exportLaunchDraft, launchDraftFormSchema, type LaunchDraftInput } from '@/lib/launchpad';
import { now, uid, useWorkspace, type LaunchDraft } from '@/lib/store';
import { download, slug, fmtDate } from '@/lib/helpers';
import { useLaunchpadWallet } from '@/lib/launchpad-wallet';
import { useLaunchpadDeploymentStore } from '@/lib/launchpad-deployment-store';
import {
  deploymentBlockReason,
  deploymentFromDraft,
  parseInitialSupply,
  SEPOLIA_ID,
  type LaunchpadDeployment,
} from '@/lib/launchpad-deployment';
import type { Hex } from 'viem';

const initialValues: LaunchDraftInput = {
  kind: 'community', name: '', symbol: '', description: '', network: 'Undecided', standard: 'Undecided',
  supply: '1000000', decimals: 18, distribution: '', website: '', socialLinks: '',
  sourceDescription: '', provenance: '', issuer: '', rights: '', accessModel: 'public',
  metadataUri: '', integrityHash: '',
};

const standards: Record<LaunchDraftInput['network'], LaunchDraftInput['standard']> = {
  Ethereum: 'ERC-20', Polygon: 'ERC-20', Base: 'ERC-20', Solana: 'SPL Token', Undecided: 'Undecided',
};

function LaunchDraftForm({ existing }: { existing?: LaunchDraft }) {
  const { upsert } = useWorkspace();
  const [, setLocation] = useLocation();
  const [saved, setSaved] = useState(false);
  const { register, handleSubmit, watch, setValue, reset, formState: { errors, isSubmitting } } = useForm<LaunchDraftInput>({
    resolver: zodResolver(launchDraftFormSchema),
    defaultValues: existing ?? initialValues,
  });
  const kind = watch('kind');
  const network = watch('network');

  useEffect(() => {
    if (existing) reset(existing);
  }, [existing, reset]);

  const onSubmit = (values: LaunchDraftInput) => {
    const timestamp = now();
    const draft = existing
      ? ({ ...existing, ...launchDraftFormSchema.parse(values), id: existing.id, status: 'Draft' as const, createdAt: existing.createdAt, updatedAt: timestamp })
      : createLaunchDraft(values, uid(), timestamp);
    upsert('launchDrafts', draft);
    setSaved(true);
    setLocation(`/launchpad/token/${encodeURIComponent(draft.id)}`);
  };

  const errorFor = (key: keyof LaunchDraftInput) => errors[key]?.message ? <span className="text-xs text-destructive" role="alert" data-testid={`error-${key}`}>{String(errors[key]?.message)}</span> : null;
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" data-testid="form-launch-draft">
      <Card className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-primary">01 / Purpose</p><h2 className="mt-1 font-serif text-2xl">Start with what this represents</h2></div>
          <Badge tone="mute">Draft status</Badge>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Draft type">
            <Select {...register('kind')} data-testid="select-draft-kind">
              <option value="community">Community token</option><option value="data">Data token</option>
            </Select>
          </Field>
          <Field label="Name">{<Input {...register('name')} placeholder="A clear working name" data-testid="input-draft-name" />}{errorFor('name')}</Field>
          <Field label="Symbol" hint="2–12 letters or numbers; saved in uppercase.">{<Input {...register('symbol')} maxLength={12} placeholder="SYMBOL" data-testid="input-draft-symbol" />}{errorFor('symbol')}</Field>
          <Field label="Short description" hint="Explain purpose without suggesting returns or rights you cannot substantiate.">
            <Textarea {...register('description')} rows={3} maxLength={2000} placeholder="What is being planned, and for whom?" data-testid="input-draft-description" />{errorFor('description')}
          </Field>
        </div>
        {kind === 'community' ? (
          <div className="rounded-lg border border-amber-300/20 bg-amber-300/[.045] p-4" data-testid="notice-community-risk">
            <div className="flex gap-3"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /><div><h3 className="text-sm font-semibold text-amber-100">Community-token risks</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Tokens may be volatile, illiquid, subject to regulatory restrictions, or lose all value. A community label does not remove financial, legal, or operational risks. Supply and distribution below are proposed values only.</p></div></div>
          </div>
        ) : (
          <div className="rounded-lg border border-destructive/35 bg-destructive/[.08] p-4" role="alert" data-testid="notice-sensitive-data">
            <div className="flex gap-3"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /><div><h3 className="text-sm font-bold">Do not place personal or private data on a public chain.</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Describe a resource, not sensitive records. A data token does not itself establish legal ownership, equity, revenue, or returns. Confirm permissions, privacy obligations, and applicable law before any real-world use.</p></div></div>
          </div>
        )}
      </Card>

      <Card className="space-y-5">
        <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-primary">02 / Proposed parameters</p><h2 className="mt-1 font-serif text-2xl">Nothing is connected or deployed</h2><p className="mt-1 text-xs text-muted-foreground">Network, standard, supply, and allocation are planning inputs only.</p></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Proposed network">
            <Select {...register('network', { onChange: (event) => setValue('standard', standards[event.target.value as LaunchDraftInput['network']], { shouldValidate: true }) })} data-testid="select-draft-network">
              {['Undecided', 'Ethereum', 'Polygon', 'Base', 'Solana'].map((n) => <option key={n} value={n}>{n}</option>)}
            </Select>
          </Field>
          <Field label="Proposed standard"><Select {...register('standard')} data-testid="select-draft-standard">{['Undecided', 'ERC-20', 'SPL Token'].map((s) => <option key={s} value={s}>{s}</option>)}</Select>{errorFor('standard')}</Field>
          <Field label="Proposed total supply" hint="Whole number, greater than zero. Deployment requires your Sepolia wallet approval.">
            <Input {...register('supply')} inputMode="numeric" placeholder="1000000" data-testid="input-draft-supply" />{errorFor('supply')}
          </Field>
          <Field label="Decimals" hint="Whole number from 0 to 18; Sepolia deployment requires 18.">
            <Input type="number" min="0" max="18" {...register('decimals', { valueAsNumber: true })} data-testid="input-draft-decimals" />{errorFor('decimals')}
          </Field>
          <div className="sm:col-span-2">
            <Field label="Proposed distribution" hint="Describe intended allocations and any assumptions. This is not an allocation on-chain.">
              <Textarea {...register('distribution')} rows={3} placeholder="Community, contributors, treasury, or other proposed allocations…" data-testid="input-draft-distribution" />{errorFor('distribution')}
            </Field>
          </div>
        </div>
      </Card>

      {kind === 'data' && <Card className="space-y-5">
        <div className="flex gap-3"><Database className="mt-1 h-5 w-5 text-primary" /><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-primary">03 / Data rights and context</p><h2 className="mt-1 font-serif text-2xl">Make the resource reviewable</h2><p className="mt-1 text-xs text-muted-foreground">Required to save a data-token draft. Do not include private data or personal identifiers.</p></div></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Dataset or resource description"><Textarea {...register('sourceDescription')} rows={3} placeholder="Describe the resource without including the resource itself." data-testid="input-source-description" />{errorFor('sourceDescription')}</Field>
          <Field label="Provenance"><Textarea {...register('provenance')} rows={3} placeholder="Origin, collection method, and permission context." data-testid="input-provenance" />{errorFor('provenance')}</Field>
          <Field label="Issuer"><Input {...register('issuer')} placeholder="Issuing organization or responsible party" data-testid="input-issuer" />{errorFor('issuer')}</Field>
          <Field label="Holder rights"><Textarea {...register('rights')} rows={3} placeholder="State what a holder may and may not do." data-testid="input-rights" />{errorFor('rights')}</Field>
          <Field label="Access model"><Select {...register('accessModel')} data-testid="select-access-model"><option value="public">Public</option><option value="licensed">Licensed</option><option value="subscription">Subscription</option><option value="other">Other</option></Select></Field>
        </div>
      </Card>}

      <Card className="space-y-5">
        <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-primary">{kind === 'data' ? '04' : '03'} / References</p><h2 className="mt-1 font-serif text-2xl">Optional supporting references</h2></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Website" hint="HTTPS only."><Input {...register('website')} placeholder="https://" data-testid="input-draft-website" />{errorFor('website')}</Field>
          <Field label="Social links" hint="One HTTPS URL per line."><Textarea {...register('socialLinks')} rows={3} placeholder="https://…" data-testid="input-draft-social-links" />{errorFor('socialLinks')}</Field>
          <Field label="Metadata URI" hint="HTTPS only; a reference, not generated by this flow."><Input {...register('metadataUri')} placeholder="https://" data-testid="input-metadata-uri" />{errorFor('metadataUri')}</Field>
          <Field label="Integrity hash" hint="Optional SHA-256, 64 hexadecimal characters."><Input {...register('integrityHash')} placeholder="Optional 32-byte hash" data-testid="input-integrity-hash" />{errorFor('integrityHash')}</Field>
        </div>
        <div className="flex flex-col-reverse justify-between gap-3 border-t border-border pt-4 sm:flex-row sm:items-center">
          <Link href={existing ? `/launchpad/token/${encodeURIComponent(existing.id)}` : '/launchpad'} data-testid="link-cancel-draft" className="inline-flex h-10 items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-2 h-4 w-4" />Cancel</Link>
          <div className="flex flex-wrap items-center gap-3">
            {saved && <span role="status" className="text-xs text-primary" data-testid="status-draft-saved">Draft saved in this browser.</span>}
            <Btn type="submit" variant="gold" disabled={isSubmitting} data-testid="button-save-draft">{isSubmitting ? 'Saving…' : existing ? 'Save draft changes' : 'Save draft'} <ArrowRight className="h-4 w-4" /></Btn>
          </div>
        </div>
      </Card>
    </form>
  );
}

export function LaunchpadOverview() {
  const { data } = useWorkspace();
  const drafts = useMemo(() => [...data.launchDrafts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [data.launchDrafts]);
  return <LaunchpadFrame active="/launchpad"><PageTitle eyebrow="Draft workspace" title="Plan with the status in view." description="Prepare a token draft, review the exact settings, then request a wallet-confirmed ERC-20 deployment on Sepolia." />
    <div className="mb-7 grid gap-3 sm:grid-cols-3">
      <Card className="sm:col-span-2 flex flex-col justify-between gap-6 bg-[linear-gradient(115deg,rgba(17,58,79,.43),rgba(14,26,46,.62))]">
        <div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-primary">Sepolia testnet</p><h2 className="mt-3 max-w-xl font-serif text-3xl leading-tight">Review the token before you sign.</h2><p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">Drafts and deployment records stay in this browser. A contract is created only after you review the settings and approve a Sepolia transaction in your wallet.</p></div>
        <Link href="/launchpad/create" data-testid="link-overview-create" className="inline-flex h-10 w-fit items-center gap-2 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground">Create a draft <ArrowRight className="h-4 w-4" /></Link>
      </Card>
      <Card className="flex flex-col justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-muted-foreground">Saved drafts</p><p className="mt-3 font-mono text-5xl text-primary" data-testid="text-draft-count">{drafts.length.toString().padStart(2, '0')}</p></div><p className="mt-4 text-xs leading-relaxed text-muted-foreground">Confirmed deployments appear separately in My tokens after you connect the same wallet.</p></Card>
    </div>
    <div className="mb-4 flex items-end justify-between gap-4"><div><h2 className="font-serif text-2xl">Recently updated</h2><p className="mt-1 text-xs text-muted-foreground">Stored locally in this browser.</p></div><Link href="/launchpad/tokens" data-testid="link-all-drafts" className="text-xs font-semibold text-primary hover:text-foreground">View all <ArrowRight className="ml-1 inline h-3.5 w-3.5" /></Link></div>
    <DraftCollection drafts={drafts.slice(0, 3)} />
  </LaunchpadFrame>;
}

export function LaunchpadCreate() {
  return <LaunchpadFrame active=""><PageTitle eyebrow="New draft" title="Write the proposal before the promise." description="Saving creates a browser-local draft only. Deployment is a separate review step and requires your explicit Sepolia wallet approval." /><LaunchDraftForm /></LaunchpadFrame>;
}

function DeploymentRecords({ records }: { records: LaunchpadDeployment[] }) {
  if (records.length === 0) {
    return <QuietEmpty testId="empty-local-deployments" title="No deployment records for this wallet" description="When you approve a Sepolia deployment, its transaction and contract address will appear here. Records are saved only in this browser." />;
  }
  return (
    <div className="grid gap-3 md:grid-cols-2" data-testid="list-local-deployments">
      {records.map((record) => (
        <Card key={record.id} data-testid={`card-local-deployment-${record.id}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate font-serif text-xl">{record.name}</h3>
              <p className="mt-1 font-mono text-xs tracking-wider text-primary">{record.symbol}</p>
            </div>
            <span
              className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                record.status === 'confirmed'
                  ? 'border-emerald-400/25 bg-emerald-400/[.06] text-emerald-200'
                  : record.status === 'failed'
                    ? 'border-rose-400/25 bg-rose-400/[.06] text-rose-200'
                    : 'border-amber-300/25 bg-amber-300/[.06] text-amber-100'
              }`}
              data-testid={`status-token-deployment-${record.id}`}
            >
              {record.status}
            </span>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {record.initialSupply} whole units · 18 decimals · owner {record.account.slice(0, 6)}…{record.account.slice(-4)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {record.mintable ? 'Owner mint enabled' : 'Fixed supply'} · {record.burnable ? 'holder burn enabled' : 'burn disabled'} · {fmtDate(record.createdAt)}
          </p>
          {record.message && <p className="mt-3 text-xs leading-relaxed text-muted-foreground" data-testid={`text-token-deployment-message-${record.id}`}>{record.message}</p>}
          <div className="mt-4 flex flex-wrap gap-3 border-t border-border pt-3 text-xs">
            <a href={`https://sepolia.etherscan.io/tx/${record.txHash}`} target="_blank" rel="noreferrer" data-testid={`link-deployment-tx-${record.id}`} className="inline-flex items-center gap-1.5 text-primary hover:underline">
              Transaction <ExternalLink className="h-3 w-3" />
            </a>
            {record.contractAddress && <a href={`https://sepolia.etherscan.io/address/${record.contractAddress}`} target="_blank" rel="noreferrer" data-testid={`link-deployment-contract-${record.id}`} className="inline-flex items-center gap-1.5 text-primary hover:underline">
              Contract <ExternalLink className="h-3 w-3" />
            </a>}
          </div>
        </Card>
      ))}
    </div>
  );
}

export function LaunchpadTokens() {
  const { data } = useWorkspace();
  const wallet = useLaunchpadWallet();
  const deployments = useLaunchpadDeploymentStore(wallet.account);
  const drafts = useMemo(() => [...data.launchDrafts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [data.launchDrafts]);
  return <LaunchpadFrame active="/launchpad/tokens">
    <PageTitle eyebrow="Your workspace" title="Your tokens and drafts" description="Confirmed Sepolia deployments are listed for the connected wallet. Drafts and deployment history are stored only in this browser." />
    <Card className="mb-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="font-serif text-2xl">Sepolia deployments</h2><p className="mt-1 text-xs text-muted-foreground">Only records for the currently connected wallet are shown.</p></div>
        {wallet.account
          ? <p className="font-mono text-xs text-primary" data-testid="text-token-list-account">{wallet.account.slice(0, 6)}…{wallet.account.slice(-4)}</p>
          : <div className="flex flex-wrap gap-2">
            <Btn size="sm" disabled={wallet.status === 'connecting'} onClick={() => void wallet.connectWallet()} data-testid="button-connect-token-list"><Wallet className="h-3.5 w-3.5" />{wallet.status === 'connecting' ? 'Connecting…' : 'Connect wallet'}</Btn>
            {wallet.walletConnectAvailable && <Btn size="sm" onClick={() => void wallet.connectWalletConnect()} data-testid="button-connect-token-list-walletconnect">WalletConnect</Btn>}
          </div>}
      </div>
      {wallet.error && <p role="alert" className="text-xs text-destructive" data-testid="alert-token-list-wallet">{wallet.error}</p>}
      {deployments.error && <p role="alert" className="text-xs text-destructive" data-testid="alert-deployment-history">{deployments.error}</p>}
      <DeploymentRecords records={deployments.records} />
    </Card>
    <div className="mb-4"><h2 className="font-serif text-2xl">Saved drafts</h2><p className="mt-1 text-xs text-muted-foreground">Drafts are separate from deployed tokens.</p></div>
    <DraftCollection drafts={drafts} />
  </LaunchpadFrame>;
}

export function LaunchpadTokenDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, remove, upsert } = useWorkspace();
  const [, setLocation] = useLocation();
  const wallet = useLaunchpadWallet();
  const deploymentStore = useLaunchpadDeploymentStore(wallet.account);
  const draft = data.launchDrafts.find((item) => item.id === id);
  const [editing, setEditing] = useState(false);
  const [exported, setExported] = useState(false);
  const [mintable, setMintable] = useState(draft?.mintable ?? false);
  const [burnable, setBurnable] = useState(draft?.burnable ?? false);
  const [acknowledgement, setAcknowledgement] = useState(false);
  const [artifactError, setArtifactError] = useState<string | null>(null);
  const [flow, setFlow] = useState<{
    draftId: string;
    account: string;
    state: 'waiting-wallet' | 'pending' | 'confirming' | 'success' | 'error';
    txHash: string | null;
    contractAddress: string | null;
    error: string | null;
    message: string | null;
  } | null>(null);
  const deployLock = useRef(false);
  const currentDeployment = draft
    ? deploymentStore.records.find((record) => record.draftId === draft.id) ?? null
    : null;
  const pendingRecord = currentDeployment?.status === 'pending' ? currentDeployment : null;
  const pendingRecordId = pendingRecord?.id ?? null;
  const pendingHash = pendingRecord?.txHash ?? null;
  const pendingSupply = pendingRecord ? parseInitialSupply(pendingRecord.initialSupply) : null;

  useEffect(() => {
    setMintable(draft?.mintable ?? false);
    setBurnable(draft?.burnable ?? false);
    setAcknowledgement(false);
    setEditing(false);
    setFlow(null);
    setArtifactError(null);
  }, [draft?.id, draft?.mintable, draft?.burnable, wallet.account, wallet.chainId]);

  useEffect(() => {
    if (!pendingRecord || !pendingHash || pendingSupply === null) return undefined;
    let cancelled = false;
    let timer: number | undefined;
    const check = async () => {
      setFlow({
        draftId: pendingRecord.draftId,
        account: pendingRecord.account,
        state: 'confirming',
        txHash: pendingHash,
        contractAddress: null,
        error: null,
        message: 'Checking the Sepolia receipt and token settings.',
      });
      const { checkTokenDeployment } = await import('@/lib/launchpad-deployer');
      const result = await checkTokenDeployment(pendingHash as Hex, {
        name: pendingRecord.name,
        symbol: pendingRecord.symbol,
        supply: pendingSupply,
        owner: pendingRecord.account,
        mintable: pendingRecord.mintable,
        burnable: pendingRecord.burnable,
      });
      if (cancelled) return;
      if (result.status === 'pending') {
        setFlow({
          draftId: pendingRecord.draftId,
          account: pendingRecord.account,
          state: 'pending',
          txHash: pendingHash,
          contractAddress: null,
          error: null,
          message: result.message,
        });
        timer = window.setTimeout(() => void check(), 15_000);
        return;
      }
      const updated: LaunchpadDeployment = {
        ...pendingRecord,
        status: result.status === 'confirmed' ? 'confirmed' : 'failed',
        contractAddress: result.contractAddress,
        message: result.message,
      };
      deploymentStore.upsert(updated);
      setFlow({
        draftId: updated.draftId,
        account: updated.account,
        state: result.status === 'confirmed' ? 'success' : 'error',
        txHash: pendingHash,
        contractAddress: result.contractAddress,
        error: result.status === 'failed' ? result.message : null,
        message: result.message,
      });
    };
    void check();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [pendingHash, pendingRecordId, pendingSupply, pendingRecord, deploymentStore.upsert]);

  if (!draft) return <LaunchpadFrame active="/launchpad/tokens"><QuietEmpty testId="empty-missing-draft" title="Draft not found" description="This browser does not have a saved draft with that identifier. It may have been removed or created in a different browser." /><Link href="/launchpad/tokens" className="mt-4 inline-flex text-sm font-semibold text-primary" data-testid="link-back-to-drafts"><ArrowLeft className="mr-2 h-4 w-4" />Back to drafts</Link></LaunchpadFrame>;
  const removeDraft = () => {
    if (window.confirm(`Delete the local draft “${draft.name}”? This cannot be undone.`)) {
      remove('launchDrafts', draft.id);
      setLocation('/launchpad/tokens');
    }
  };
  const exportDraft = () => {
    download(`${slug(draft.name)}-draft.json`, exportLaunchDraft(draft), 'application/json');
    setExported(true);
  };
  const matchingFlow = flow
    && flow.draftId === draft.id
    && flow.account.toLowerCase() === (wallet.account ?? '').toLowerCase()
    ? flow
    : null;
  const deploymentState: 'idle' | 'waiting-wallet' | 'pending' | 'confirming' | 'success' | 'error' =
    matchingFlow?.state
      ?? (currentDeployment?.status === 'confirmed' ? 'success' : currentDeployment?.status === 'failed' ? 'error' : currentDeployment?.status === 'pending' ? 'pending' : 'idle');
  const deploymentTxHash = matchingFlow?.txHash ?? currentDeployment?.txHash ?? null;
  const deployedAddress = matchingFlow?.contractAddress ?? currentDeployment?.contractAddress ?? null;
  const deploymentError = matchingFlow?.error
    ?? (currentDeployment?.status === 'failed' ? currentDeployment.message ?? 'The deployment transaction failed.' : null);
  const deploymentMessage = matchingFlow?.message ?? currentDeployment?.message ?? null;
  const deploymentBlockedReason = deploymentBlockReason(draft);
  const reviewedDraft = {
    ...draft,
    mintable: currentDeployment && currentDeployment.status !== 'failed' ? currentDeployment.mintable : mintable,
    burnable: currentDeployment && currentDeployment.status !== 'failed' ? currentDeployment.burnable : burnable,
  };
  const downloadArtifact = async (kind: 'source' | 'abi' | 'bundle' | 'compiler') => {
    setArtifactError(null);
    try {
      const artifacts = await import('@/lib/contract-artifacts');
      const prefix = slug(draft.name);
      const owner = currentDeployment?.account ?? wallet.account;
      if (kind === 'source') download(`${prefix}-TinanToken.sol`, artifacts.tokenSource, 'text/plain');
      if (kind === 'abi') download(`${prefix}-abi.json`, artifacts.tokenAbiJson, 'application/json');
      if (kind === 'compiler') download(`${prefix}-compiler-input.json`, artifacts.compilerInputJson, 'application/json');
      if (kind === 'bundle') download(`${prefix}-contract-bundle.json`, artifacts.exportContractBundle(reviewedDraft, owner), 'application/json');
    } catch (error) {
      setArtifactError(error instanceof Error ? error.message : 'Contract files could not be prepared.');
    }
  };

  const deploy = async () => {
    if (
      deployLock.current
      || !wallet.provider
      || !wallet.account
      || wallet.status !== 'ready'
      || wallet.chainId !== SEPOLIA_ID
      || deploymentBlockedReason
      || currentDeployment?.status === 'pending'
      || currentDeployment?.status === 'confirmed'
    ) return;
    deployLock.current = true;
    setFlow({
      draftId: draft.id,
      account: wallet.account,
      state: 'waiting-wallet',
      txHash: null,
      contractAddress: null,
      error: null,
      message: 'Review the deployment request in your wallet. No transaction is submitted until you approve it.',
    });
    try {
      const { checkTokenDeployment, submitTokenDeployment } = await import('@/lib/launchpad-deployer');
      const hash = await submitTokenDeployment({
        provider: wallet.provider,
        draft,
        account: wallet.account,
        mintable,
        burnable,
      });
      const pending = deploymentFromDraft(draft, wallet.account, hash, {
        id: uid(),
        createdAt: now(),
        mintable,
        burnable,
      });
      const stored = deploymentStore.upsert(pending);
      setFlow({
        draftId: draft.id,
        account: wallet.account,
        state: 'pending',
        txHash: hash,
        contractAddress: null,
        error: null,
        message: stored.error ?? 'Transaction submitted; waiting for one Sepolia confirmation.',
      });
      const result = await checkTokenDeployment(hash, {
        name: draft.name,
        symbol: draft.symbol,
        supply: parseInitialSupply(draft.supply),
        owner: wallet.account,
        mintable,
        burnable,
      });
      if (result.status === 'pending') {
        setFlow((current) => current?.txHash === hash
          ? { ...current, state: 'pending', message: stored.error ?? result.message }
          : current);
        return;
      }
      const completed: LaunchpadDeployment = {
        ...pending,
        status: result.status === 'confirmed' ? 'confirmed' : 'failed',
        contractAddress: result.contractAddress,
        message: stored.error ?? result.message,
      };
      deploymentStore.upsert(completed);
      setFlow({
        draftId: draft.id,
        account: wallet.account,
        state: result.status === 'confirmed' ? 'success' : 'error',
        txHash: hash,
        contractAddress: result.contractAddress,
        error: result.status === 'failed' ? result.message : null,
        message: stored.error ?? result.message,
      });
    } catch (deployError) {
      const candidate = deployError && typeof deployError === 'object' && 'code' in deployError
        ? (deployError as { code?: unknown }).code
        : undefined;
      const message = candidate === 4001 || candidate === '4001'
        ? 'The wallet rejected the request. No transaction was submitted.'
        : (deployError instanceof Error ? deployError.message : 'Deployment request failed.').slice(0, 300);
      setFlow({
        draftId: draft.id,
        account: wallet.account,
        state: 'error',
        txHash: null,
        contractAddress: null,
        error: message,
        message: null,
      });
    } finally {
      deployLock.current = false;
    }
  };

  const addToMetaMask = async () => {
    if (!wallet.provider || !deployedAddress) return;
    if (!wallet.account || wallet.chainId !== SEPOLIA_ID) {
      setFlow({
        draftId: draft.id,
        account: wallet.account ?? currentDeployment?.account ?? '',
        state: 'success',
        txHash: deploymentTxHash,
        contractAddress: deployedAddress,
        error: null,
        message: !wallet.account
          ? 'Connect the wallet used for this token before adding it to MetaMask.'
          : 'Switch your wallet to Sepolia before adding this token to MetaMask.',
      });
      return;
    }
    try {
      const { addErc20ToMetaMask } = await import('@/lib/launchpad-deployer');
      const added = await addErc20ToMetaMask(wallet.provider, deployedAddress, draft.symbol);
      setFlow((current) => ({
        ...(current ?? {
          draftId: draft.id,
          account: wallet.account!,
          state: 'success' as const,
          txHash: deploymentTxHash,
          contractAddress: deployedAddress,
          error: null,
          message: null,
        }),
        message: added ? 'Token added to MetaMask.' : 'MetaMask did not add the token.',
      }));
    } catch (addError) {
      setFlow((current) => ({
        ...(current ?? {
          draftId: draft.id,
          account: wallet.account!,
          state: 'success' as const,
          txHash: deploymentTxHash,
          contractAddress: deployedAddress,
          error: null,
          message: null,
        }),
        message: addError instanceof Error ? addError.message.slice(0, 240) : 'MetaMask could not add the token.',
      }));
    }
  };
  return <LaunchpadFrame active="/launchpad/tokens">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><Link href="/launchpad/tokens" data-testid="link-detail-back" className="inline-flex items-center text-xs font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-2 h-4 w-4" />All drafts</Link><div className="flex flex-wrap gap-2"><Btn size="sm" onClick={exportDraft} data-testid="button-export-draft"><ArrowDownToLine className="h-3.5 w-3.5" />Export JSON</Btn><Btn size="sm" variant="danger" onClick={removeDraft} data-testid="button-delete-draft"><Trash2 className="h-3.5 w-3.5" />Delete</Btn></div></div>
    {exported && <p className="mb-4 text-xs text-primary" role="status" data-testid="status-exported">Configuration JSON exported. This file is not a contract or transaction.</p>}
    {editing ? <><PageTitle eyebrow="Edit local draft" title={draft.name} description="Keep the proposal accurate. Changes update this browser-local record only." /><LaunchDraftForm existing={draft} /></> : <>
      <PageTitle eyebrow={`${draft.kind} token / Draft`} title={draft.name} description={draft.description} />
      <div className="mb-5 flex flex-wrap items-center gap-2"><Badge tone="mute">Draft record</Badge><span className="font-mono text-sm text-primary">{draft.symbol}</span><span className="text-xs text-muted-foreground">Saved in this browser</span>{currentDeployment?.status === 'confirmed' && <Badge tone="ok">Sepolia deployment confirmed</Badge>}</div>
      <div className="grid gap-4 lg:grid-cols-[1.25fr_.75fr]">
        <Card className="space-y-5">
          <div className="flex items-center justify-between border-b border-border pb-3"><h2 className="font-serif text-2xl">Proposal details</h2><Btn size="sm" variant="gold" onClick={() => setEditing(true)} disabled={currentDeployment?.status === 'pending' || currentDeployment?.status === 'confirmed'} title={currentDeployment?.status === 'confirmed' ? 'Create a new draft to change a deployed token.' : undefined} data-testid="button-edit-draft">Edit draft</Btn></div>
          <dl className="grid gap-x-5 gap-y-4 sm:grid-cols-2">{[['Proposed network', draft.network], ['Proposed standard', draft.standard], ['Proposed supply', draft.supply], ['Decimals', String(draft.decimals)], ['Distribution', draft.distribution], ['Website', draft.website || 'Not provided'], ['Social links', draft.socialLinks || 'Not provided'], ['Metadata reference', draft.metadataUri || 'Not provided'], ['Integrity hash', draft.integrityHash || 'Not provided']].map(([key, value]) => <div key={key}><dt className="text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">{key}</dt><dd className="mt-1 whitespace-pre-line break-words text-sm text-foreground/90" data-testid={`text-detail-${key.toLowerCase().replaceAll(' ', '-')}`}>{value}</dd></div>)}</dl>
        </Card>
        <div className="space-y-4">
          {draft.kind === 'data' && <Card className="space-y-3"><h2 className="font-serif text-xl">Resource rights and access</h2><dl className="space-y-3">{[['Dataset or resource', draft.sourceDescription], ['Provenance', draft.provenance], ['Issuer', draft.issuer], ['Holder rights', draft.rights], ['Access model', draft.accessModel]].map(([key, value]) => <div key={key}><dt className="text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">{key}</dt><dd className="mt-1 whitespace-pre-line break-words text-sm">{value || 'Not provided'}</dd></div>)}</dl><p className="border-t border-border pt-3 text-xs leading-relaxed text-destructive">Do not put personal or private data on a public chain. A data token does not establish ownership, equity, revenue, or returns.</p></Card>}
          {draft.kind === 'community' && <Card className="border-amber-300/20"><h2 className="font-serif text-xl text-amber-100">Risk remains real</h2><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Volatility, low liquidity, regulatory obligations, and total loss are possible. Supply and distribution are proposed values only.</p></Card>}
          <Card><div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-primary" /><h2 className="font-serif text-xl">Record timestamps</h2></div><p className="mt-3 text-xs text-muted-foreground">Created {fmtDate(draft.createdAt)}</p><p className="mt-1 text-xs text-muted-foreground">Updated {fmtDate(draft.updatedAt)}</p><p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">Draft settings are local. Any deployment is a separate Sepolia transaction, tied to its own wallet and confirmation status.</p></Card>
        </div>
      </div>
      <Card className="mt-5 space-y-3" data-testid="card-contract-files">
        <h2 className="font-serif text-2xl">Contract source and build files</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">Review the exact OpenZeppelin-based Solidity template, ABI and compiler input. Token settings are constructor arguments, not edits to the template. Downloads do not deploy a contract or designate an official TINANAI token.</p>
        <div className="flex flex-wrap gap-2">
          <Btn size="sm" onClick={() => void downloadArtifact('source')} data-testid="button-detail-download-source">Solidity source</Btn>
          <Btn size="sm" onClick={() => void downloadArtifact('abi')} data-testid="button-detail-download-abi">ABI JSON</Btn>
          <Btn size="sm" disabled={Boolean(deploymentBlockedReason)} onClick={() => void downloadArtifact('bundle')} data-testid="button-detail-download-bundle">Contract bundle</Btn>
          <Btn size="sm" onClick={() => void downloadArtifact('compiler')} data-testid="button-detail-download-compiler">Compiler input</Btn>
        </div>
        {artifactError && <p role="alert" className="text-xs text-destructive">{artifactError}</p>}
      </Card>
      {deploymentStore.error && <p role="alert" className="mt-5 text-xs text-destructive" data-testid="alert-deployment-store">{deploymentStore.error}</p>}
      <Card className="mt-5">
        <LaunchpadDeployPanel
          draft={draft}
          account={wallet.account}
          chainId={wallet.chainId}
          walletStatus={wallet.status}
          walletError={wallet.error}
          walletConnectAvailable={wallet.walletConnectAvailable}
          deploymentBlockedReason={deploymentBlockedReason}
          mintable={currentDeployment && currentDeployment.status !== 'failed' ? currentDeployment.mintable : mintable}
          burnable={currentDeployment && currentDeployment.status !== 'failed' ? currentDeployment.burnable : burnable}
          acknowledgement={acknowledgement}
          deploymentState={deploymentState}
          txHash={deploymentTxHash}
          contractAddress={deployedAddress}
          deploymentError={deploymentError}
          deploymentMessage={deploymentMessage}
          onConnectInjected={() => void wallet.connectInjected()}
          onConnectWalletConnect={() => void wallet.connectWalletConnect()}
          onSwitchToSepolia={() => void wallet.switchToSepolia()}
          onOptions={(option, enabled) => {
            if (option === 'mintable') setMintable(enabled);
            else setBurnable(enabled);
            setAcknowledgement(false);
            upsert('launchDrafts', { ...draft, [option]: enabled, updatedAt: now() });
          }}
          onAcknowledgementChange={setAcknowledgement}
          onDeploy={() => void deploy()}
          onAddToMetaMask={() => void addToMetaMask()}
        />
      </Card>
    </>}
  </LaunchpadFrame>;
}

export function LaunchpadExplore() {
  return <LaunchpadFrame active="/launchpad/explore"><PageTitle eyebrow="Explore" title="No live listings are connected." description="Launchpad does not have a configured live-token provider. This page will not invent tokens, prices, holders, or liquidity." /><QuietEmpty testId="empty-live-tokens" title="Live-token source unavailable" description="There is no configured provider for live tokens. Your local drafts are available separately and are not public listings." /><div className="mt-4"><Link href="/launchpad/tokens" data-testid="link-explore-drafts" className="inline-flex items-center gap-2 text-sm font-semibold text-primary">View local drafts <ArrowRight className="h-4 w-4" /></Link></div></LaunchpadFrame>;
}

export function LaunchpadAnalytics() {
  return <LaunchpadFrame active="/launchpad/analytics"><PageTitle eyebrow="Analytics" title="On-chain analytics are unavailable." description="No chain data source is configured for Launchpad. This workspace does not query RPC endpoints or report fabricated balances, holders, activity, or prices." /><QuietEmpty testId="empty-analytics-source" title="No analytics source configured" description="There is no on-chain data to display. Saved drafts are planning records in this browser and have no on-chain activity to analyze." /></LaunchpadFrame>;
}

export function LaunchpadHistory() {
  const { data } = useWorkspace();
  const wallet = useLaunchpadWallet();
  const deployments = useLaunchpadDeploymentStore(wallet.account);
  const records = useMemo(() => [...data.launchDrafts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [data.launchDrafts]);
  return <LaunchpadFrame active="/launchpad/history"><PageTitle eyebrow="Local history" title="Drafts and deployment activity." description="Draft timestamps are local saves. Sepolia transaction records are shown only for the connected wallet and remain in this browser." />
    {deployments.error && <p role="alert" className="mb-4 text-xs text-destructive" data-testid="alert-history-storage">{deployments.error}</p>}
    {wallet.account ? <DeploymentRecords records={deployments.records} /> : <Card className="mb-5 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Connect the wallet used for deployment to see its local transaction records.</p><Btn size="sm" disabled={wallet.status === 'connecting'} onClick={() => void wallet.connectWallet()} data-testid="button-connect-history-wallet"><Wallet className="h-3.5 w-3.5" />Connect wallet</Btn></Card>}
    <h2 className="mb-3 mt-7 font-serif text-2xl">Draft edits</h2>
    {records.length === 0 ? <QuietEmpty testId="empty-draft-history" title="No draft records yet" description="When you save a draft in this browser, its created and updated dates will appear here. These are local record timestamps, not chain events." /> :
      <div className="overflow-hidden rounded-xl border border-border bg-card/65" data-testid="list-draft-history"><div className="hidden grid-cols-[1fr_140px_140px_100px] gap-4 border-b border-border px-5 py-3 text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground sm:grid"><span>Draft record</span><span>Type</span><span>Updated</span><span>Status</span></div>
        {records.map((draft) => <Link key={draft.id} href={`/launchpad/token/${encodeURIComponent(draft.id)}`} data-testid={`row-draft-history-${draft.id}`} className="grid gap-2 border-b border-border px-5 py-4 last:border-0 hover:bg-secondary/40 sm:grid-cols-[1fr_140px_140px_100px] sm:items-center sm:gap-4">
          <span><span className="block font-semibold">{draft.name} <span className="font-mono text-xs text-primary">{draft.symbol}</span></span><span className="mt-1 block text-[11px] text-muted-foreground">Created {fmtDate(draft.createdAt)}</span></span>
          <span className="text-xs capitalize text-muted-foreground">{draft.kind} token</span><span className="text-xs text-muted-foreground">{fmtDate(draft.updatedAt)}</span><span><Badge tone="mute">Draft</Badge></span>
        </Link>)}
      </div>}
    <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground"><Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" />Draft timestamps are local saves. Deployment status comes from Sepolia transaction receipts and may be delayed by public RPC availability.</p>
  </LaunchpadFrame>;
}

export function LaunchpadGuide() {
  const guideSections = [
    ['01', 'Purpose and planning', 'Describe what is being proposed, who it serves, and what remains undecided. This deployment flow is limited to ERC-20 contracts on Sepolia with 18 decimals.'],
    ['02', 'Rights and responsibility', 'A token draft is not legal advice. Consider jurisdiction, securities and consumer rules, tax, governance, and any permissions needed before issuing anything. Ask qualified professionals to review the plan.'],
    ['03', 'Privacy and data', 'Never publish personal, confidential, or private data to a public chain. Describe a dataset or resource without including its contents. Document provenance, issuer, holder rights, and access model. A data token alone establishes no ownership, equity, revenue, or returns.'],
    ['04', 'Risk and expectations', 'Community tokens can be volatile, illiquid, restricted, or lose all value. Do not imply guaranteed outcomes. A supply number or distribution plan is only a planning note and does not confer any rights by itself.'],
    ['05', 'Storage and status', 'Drafts and deployment history are saved only in this browser’s local storage. They are not synchronized or backed up automatically. Export configuration JSON for a separate copy; it is not a transaction or deployment record.'],
  ];
  return <LaunchpadFrame active="/launchpad/guide"><PageTitle eyebrow="Planning guide" title="Know what deployment does and does not do." description="Launchpad can submit user-approved Sepolia testnet deployments. It is not an issuance, legal-compliance, investment, or security-audit service." />
    <div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
      <div className="space-y-3">{guideSections.map(([number, title, body]) => <Card key={number} className="flex gap-4"><span className="pt-1 font-mono text-xs text-primary">{number}</span><div><h2 className="font-serif text-xl">{title}</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p></div></Card>)}</div>
      <aside className="h-fit space-y-4"><Card className="border-amber-300/25 bg-amber-300/[.045]"><ShieldAlert className="h-5 w-5 text-amber-300" /><h2 className="mt-3 font-serif text-2xl">Sepolia only. You approve every transaction.</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">TINANAI never receives private keys or submits transactions without your connected wallet. A Sepolia deployment is testnet activity, not an Ethereum Mainnet launch, audit, or guarantee.</p></Card>
        <Card><h2 className="font-serif text-xl">A draft stays separate.</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">Saving or exporting a draft does not deploy it. The contract owner is the connected wallet and any minting permission is permanent in the deployed bytecode.</p><Link href="/launchpad/create" data-testid="link-guide-create" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary">Start a planning draft <FilePlus2 className="h-4 w-4" /></Link></Card>
      </aside>
    </div>
  </LaunchpadFrame>;
}

export default LaunchpadOverview;
