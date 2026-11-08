import { useId, useRef, type ChangeEvent, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  FileCheck2,
  FileText,
  Fingerprint,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { EUREKA_CORE } from '@/lib/eureka-core';

export interface RegistrySnapshot {
  address: string;
  chainId: string;
  networkName: string;
  name: string;
  version: string;
  manifest: string;
  proofCount: string | number;
  owner: string;
  eurekaToken: string;
  eurekaLink: string;
  tokenMismatch: boolean;
}

export interface SelectedProofFile {
  name: string;
  size: number;
  mimeType: string;
  sha256: string;
  bytes32: string;
}

export interface RegistrationResult {
  state: 'idle' | 'submitting' | 'confirming' | 'success' | 'failed';
  proofId?: string;
  txHash?: string;
  blockNumber?: string | number;
  explorerUrl?: string;
  message?: string;
}

export interface VerificationResult {
  state: 'idle' | 'loading' | 'match' | 'mismatch' | 'failed';
  proofId?: string;
  storedHash?: string;
  localHash?: string;
  submitter?: string;
  dataCid?: string;
  label?: string;
  timestamp?: string;
  redacted?: boolean;
  message?: string;
}

export interface DocumentProofWorkflowProps {
  walletAvailable: boolean;
  account: string | null;
  status: 'idle' | 'connecting' | 'reading' | 'wrong-network' | 'unavailable' | 'ready' | 'unauthorized';
  chainId: string | null;
  registry: RegistrySnapshot | null;
  authorized: boolean | null;
  file: SelectedProofFile | null;
  hashing: boolean;
  proofId: string;
  label: string;
  dataCid: string;
  acknowledged: boolean;
  registration: RegistrationResult;
  verification: VerificationResult;
  error: string | null;
  onConnect: () => void;
  onRefresh: () => void;
  onSelectFile: (file: File | null) => void;
  onProofIdChange: (value: string) => void;
  onLabelChange: (value: string) => void;
  onDataCidChange: (value: string) => void;
  onAcknowledge: (checked: boolean) => void;
  onRegister: () => void;
  onVerify: () => void;
  onClearFile: () => void;
}

const shortAddress = (value?: string | null) => {
  if (!value) return '—';
  if (value.length < 18) return value;
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
};

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)} ${units[unit]}`;
};

function Value({ children, mono = false }: { children: ReactNode; mono?: boolean }) {
  return (
    <dd className={`mt-1 break-all text-sm text-slate-100 ${mono ? 'font-mono text-[12px] leading-relaxed' : ''}`}>
      {children || <span className="text-slate-500">Not available</span>}
    </dd>
  );
}

function MetaItem({ label, children, mono = false }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0 border-t border-slate-700/70 pt-3">
      <dt className="text-[10px] font-bold uppercase tracking-[.17em] text-slate-500">{label}</dt>
      <Value mono={mono}>{children}</Value>
    </div>
  );
}

function StatePill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const toneClass = {
    neutral: 'border-slate-600/80 bg-slate-800/70 text-slate-300',
    good: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
    warn: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
    bad: 'border-rose-400/30 bg-rose-400/10 text-rose-200',
  }[tone];
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em] ${toneClass}`}>{children}</span>;
}

function statusLabel(status: DocumentProofWorkflowProps['status']) {
  return {
    idle: 'Not connected',
    connecting: 'Connecting',
    reading: 'Reading registry',
    'wrong-network': 'Wrong network',
    unavailable: 'Unavailable',
    ready: 'Ready',
    unauthorized: 'Authorization required',
  }[status];
}

export default function DocumentProofWorkflow(props: DocumentProofWorkflowProps) {
  const {
    walletAvailable, account, status, chainId, registry, authorized, file, hashing,
    proofId, label, dataCid, acknowledged, registration, verification, error,
    onConnect, onRefresh, onSelectFile, onProofIdChange, onLabelChange, onDataCidChange,
    onAcknowledge, onRegister, onVerify, onClearFile,
  } = props;
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const busyRegistration = registration.state === 'submitting' || registration.state === 'confirming';
  const canRegister = !!file && !hashing && !!file.sha256 && !!label.trim() &&
    acknowledged && authorized === true && status === 'ready' && !busyRegistration;

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    onSelectFile(event.target.files?.[0] ?? null);
    event.target.value = '';
  };

  const walletTone = status === 'ready' && account ? 'good' : status === 'wrong-network' || status === 'unauthorized' ? 'warn' : status === 'unavailable' ? 'bad' : 'neutral';
  const verificationTone = verification.state === 'match' ? 'good' : verification.state === 'mismatch' ? 'warn' : verification.state === 'failed' ? 'bad' : 'neutral';

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 text-slate-100" data-testid="document-proof-workflow">
      <header className="relative overflow-hidden rounded-2xl border border-cyan-300/15 bg-[linear-gradient(125deg,rgba(14,34,54,.96),rgba(10,21,38,.94)_58%,rgba(24,31,53,.94))] p-6 shadow-[0_22px_70px_rgba(1,8,20,.28)] sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-24 h-64 w-64 rounded-full border border-cyan-200/10" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-2 -top-14 h-44 w-44 rounded-full border border-cyan-200/10" />
        <div className="relative grid gap-7 lg:grid-cols-[minmax(0,1fr)_250px] lg:items-end">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.24em] text-cyan-200/80">
              <Fingerprint className="h-4 w-4" aria-hidden="true" /> Proof of data
            </div>
            <h1 className="mt-4 max-w-2xl text-3xl font-semibold tracking-[-.045em] text-slate-50 sm:text-4xl">Register a document proof</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              Create a private file hash, review the public metadata, then authorize and confirm its registry transaction.
            </p>
          </div>
          <div className="rounded-xl border border-slate-600/50 bg-slate-950/30 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-500">Wallet status</span>
              <StatePill tone={walletTone}>{statusLabel(status)}</StatePill>
            </div>
            <p className="mt-3 truncate font-mono text-xs text-slate-200" title={account ?? undefined} data-testid="wallet-account">
              {account ?? 'No account connected'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {registry?.networkName ?? 'Network pending'} {chainId ? `· chain ${chainId}` : ''}
            </p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={onConnect} disabled={!walletAvailable || status === 'connecting'} data-testid="button-connect-wallet" className="inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-cyan-300 px-3 text-xs font-bold text-slate-950 transition hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50">
                {status === 'connecting' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" />}
                {account ? 'Connect account' : 'Connect wallet'}
              </button>
              <button type="button" onClick={onRefresh} aria-label="Refresh wallet and registry status" data-testid="button-refresh-status" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-600 text-slate-300 transition hover:border-cyan-300/50 hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200">
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {error && (
        <div role="alert" data-testid="proof-error" className="flex items-start gap-3 rounded-xl border border-rose-400/30 bg-rose-950/30 p-4 text-sm text-rose-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" aria-hidden="true" />
          <p>{error}</p>
        </div>
      )}

      <section aria-labelledby="registry-heading" className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-5 sm:p-6" data-testid="registry-panel">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.2em] text-cyan-200/70">01 / Destination</p>
            <h2 id="registry-heading" className="mt-1 text-lg font-semibold tracking-tight">Verified proof registry</h2>
          </div>
          {registry ? <StatePill tone="good"><ShieldCheck className="h-3 w-3" aria-hidden="true" /> Registry read</StatePill> : <StatePill>{status === 'reading' ? 'Reading…' : 'Awaiting registry'}</StatePill>}
        </div>
        {status === 'reading' && !registry ? (
          <div className="space-y-3" role="status" aria-label="Reading registry metadata" data-testid="registry-loading">
            <div className="h-4 w-2/3 animate-pulse rounded bg-slate-700/70" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-slate-700/50" />
          </div>
        ) : (
          <>
            {!registry && <p className="mb-4 text-sm text-slate-400" data-testid="registry-empty">Registry details will appear after connection and network validation.</p>}
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="registry-metadata">
              <MetaItem label="Address" mono>{registry?.address}</MetaItem>
              <MetaItem label="Network / chain">{registry ? `${registry.networkName} · ${registry.chainId}` : '—'}</MetaItem>
              <MetaItem label="NAME">{registry?.name}</MetaItem>
              <MetaItem label="VERSION">{registry?.version}</MetaItem>
              <MetaItem label="MANIFEST" mono>{registry?.manifest}</MetaItem>
              <MetaItem label="Proof count">{registry?.proofCount}</MetaItem>
              <MetaItem label="Owner" mono>{registry?.owner}</MetaItem>
              <MetaItem label="Eureka token" mono>{registry?.eurekaToken}</MetaItem>
              <MetaItem label="Eureka link" mono>{registry?.eurekaLink}</MetaItem>
            </dl>
          </>
        )}
        <a href={EUREKA_CORE.verifiedSourceUrl} target="_blank" rel="noreferrer" data-testid="link-verified-contract-source" className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-cyan-200 underline decoration-cyan-200/30 underline-offset-4 hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200">
          View verified source and ABI <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
        {registry?.tokenMismatch && (
          <div role="alert" data-testid="warning-token-mismatch" className="mt-5 flex items-start gap-3 rounded-lg border border-amber-300/30 bg-amber-200/[.06] p-3 text-sm text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p className="min-w-0 break-words"><strong className="font-semibold">Token link mismatch.</strong> The verified registry links <code className="break-all">{registry.eurekaToken}</code>, while the separately supplied EUREKA token is <code className="break-all">{EUREKA_CORE.suppliedTokenAddress}</code>. Proceeding with the verified registry as approved; no token transfers or approvals are used.</p>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)]">
        <section aria-labelledby="file-heading" className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-5 sm:p-6" data-testid="file-panel">
          <div className="mb-5">
            <p className="text-[10px] font-bold uppercase tracking-[.2em] text-cyan-200/70">02 / Local document</p>
            <h2 id="file-heading" className="mt-1 text-lg font-semibold tracking-tight">Select a file to hash</h2>
            <p className="mt-1 text-xs leading-5 text-slate-400">The file is hashed in this browser. Its bytes are not uploaded.</p>
          </div>
          <input ref={fileInputRef} id={inputId} className="sr-only" type="file" onChange={handleFile} aria-label="Choose a document for local hashing" data-testid="input-proof-file" />
          {!file ? (
            <button type="button" onClick={() => fileInputRef.current?.click()} data-testid="button-select-file" className="group flex min-h-44 w-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-600 bg-slate-950/25 px-5 text-center transition hover:border-cyan-300/50 hover:bg-cyan-300/[.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200">
              <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl border border-slate-600 bg-slate-800/80 text-cyan-200 transition group-hover:border-cyan-200/40"><Upload className="h-5 w-5" aria-hidden="true" /></span>
              <span className="text-sm font-semibold text-slate-100">Choose document</span>
              <span className="mt-1 text-xs text-slate-500">Any file type · file bytes stay in your browser</span>
            </button>
          ) : (
            <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/[.035] p-4" data-testid="selected-proof-file">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-cyan-200/20 bg-slate-950/50 text-cyan-200"><FileText className="h-5 w-5" aria-hidden="true" /></span>
                <div className="min-w-0 flex-1">
                  <p className="break-all text-sm font-semibold text-slate-100" data-testid="file-name">{file.name}</p>
                  <p className="mt-1 text-xs text-slate-400">{formatBytes(file.size)} <span className="px-1 text-slate-600">·</span> {file.mimeType || 'Unknown MIME type'}</p>
                </div>
                <button type="button" onClick={onClearFile} aria-label="Clear selected document" data-testid="button-clear-file" className="rounded-md px-2 py-1 text-xs font-semibold text-slate-400 underline decoration-slate-600 underline-offset-4 transition hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200">Remove</button>
              </div>
              <dl className="mt-4 grid gap-3 border-t border-slate-700/70 pt-3 sm:grid-cols-2">
                <MetaItem label="SHA-256" mono>{hashing ? <span role="status" className="inline-flex items-center gap-2 text-cyan-100"><LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Calculating locally</span> : file.sha256}</MetaItem>
                <MetaItem label="bytes32" mono>{file.bytes32}</MetaItem>
              </dl>
            </div>
          )}
          {hashing && !file && <p role="status" className="mt-3 text-xs text-cyan-100" data-testid="hashing-status">Calculating the file hash locally…</p>}
        </section>

        <section aria-labelledby="registration-heading" className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-5 sm:p-6" data-testid="registration-panel">
          <div className="mb-5">
            <p className="text-[10px] font-bold uppercase tracking-[.2em] text-cyan-200/70">03 / Public record</p>
            <h2 id="registration-heading" className="mt-1 text-lg font-semibold tracking-tight">Review registration details</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label htmlFor={`${inputId}-label`} className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Registration label</label>
              <input id={`${inputId}-label`} value={label} onChange={(event) => onLabelChange(event.target.value)} maxLength={80} placeholder="A concise, public description" data-testid="input-registration-label" className="h-10 w-full rounded-lg border border-slate-600/80 bg-slate-950/50 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-300/70 focus:ring-2 focus:ring-cyan-300/15" />
            </div>
            <div>
              <label htmlFor={`${inputId}-cid`} className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Data CID <span className="font-normal normal-case tracking-normal text-slate-500">· optional</span></label>
              <input id={`${inputId}-cid`} value={dataCid} onChange={(event) => onDataCidChange(event.target.value)} maxLength={300} placeholder="ipfs:// or ar:// public ID" data-testid="input-data-cid" className="h-10 w-full rounded-lg border border-slate-600/80 bg-slate-950/50 px-3 font-mono text-xs text-slate-100 outline-none transition placeholder:font-sans placeholder:text-slate-600 focus:border-cyan-300/70 focus:ring-2 focus:ring-cyan-300/15" />
              <p className="mt-1.5 text-[11px] leading-4 text-slate-500">Public IPFS or Arweave ID only. URL-style and private links are blocked.</p>
            </div>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-700 bg-slate-950/30 p-3.5 transition hover:border-slate-500">
              <input type="checkbox" checked={acknowledged} onChange={(event) => onAcknowledge(event.target.checked)} data-testid="checkbox-public-acknowledgement" className="mt-0.5 h-4 w-4 shrink-0 accent-cyan-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200" />
              <span className="text-xs leading-5 text-slate-300">I understand the hash and selected label/CID are public on-chain and permanent. I have reviewed the metadata before authorizing this registration.</span>
            </label>
            <div className="rounded-lg border border-slate-700/80 bg-slate-950/30 p-3.5 text-xs leading-5 text-slate-400" data-testid="public-permanence-notice">
              File bytes never leave the browser. The hash and selected label/CID are public on-chain. redactProof can clear current label/CID fields, but it cannot erase historical transactions or block data. No token transfer or approval is used.
            </div>
            {authorized === false && (
              <p className="flex items-start gap-2 text-xs leading-5 text-amber-100" data-testid="authorization-required">
                <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Registry authorization is required before registration. No transaction will be submitted until authorized.
              </p>
            )}
            <button type="button" onClick={onRegister} disabled={!canRegister} data-testid="button-register-proof" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400">
              {busyRegistration ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
              {registration.state === 'submitting' ? 'Waiting for wallet confirmation' : registration.state === 'confirming' ? 'Verifying mined event' : 'Authorize & register proof'}
            </button>
            <p className="text-center text-[11px] leading-4 text-slate-500">The wallet must confirm, then a mined ProofRegistered event must be verified before success.</p>
          </div>
        </section>
      </div>

      {(registration.state !== 'idle' || registration.message) && (
        <section aria-labelledby="registration-result-heading" className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-5 sm:p-6" data-testid="registration-result">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.2em] text-cyan-200/70">Registration status</p>
              <h2 id="registration-result-heading" className="mt-1 text-lg font-semibold">Transaction and proof result</h2>
            </div>
            <StatePill tone={registration.state === 'success' ? 'good' : registration.state === 'failed' ? 'bad' : busyRegistration ? 'warn' : 'neutral'}>
              {registration.state === 'success' && <CheckCircle2 className="h-3 w-3" aria-hidden="true" />}
              {registration.state === 'submitting' ? 'Wallet confirmation' : registration.state === 'confirming' ? 'Confirming on chain' : registration.state}
            </StatePill>
          </div>
          {busyRegistration && <div role="status" className="mt-4 rounded-lg border border-cyan-300/15 bg-cyan-300/[.04] p-3 text-sm text-cyan-100" data-testid="registration-progress">Waiting for wallet confirmation and mined event verification. No success is reported before ProofRegistered is verified.</div>}
          {registration.message && <p className="mt-4 text-sm text-slate-300" data-testid="registration-message">{registration.message}</p>}
          {registration.state === 'success' && (
            <dl className="mt-4 grid gap-4 border-t border-slate-700/70 pt-4 sm:grid-cols-3">
              <MetaItem label="Proof ID" mono>{registration.proofId}</MetaItem>
              <MetaItem label="Transaction hash" mono>{registration.txHash}</MetaItem>
              <MetaItem label="Mined block">{registration.blockNumber}</MetaItem>
            </dl>
          )}
          {registration.explorerUrl && (
            <a href={registration.explorerUrl} target="_blank" rel="noreferrer" data-testid="link-transaction-explorer" className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-cyan-200 underline decoration-cyan-200/30 underline-offset-4 hover:text-cyan-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200">
              View transaction in explorer <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          )}
        </section>
      )}

      <section aria-labelledby="verification-heading" className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-5 sm:p-6" data-testid="verification-panel">
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.2em] text-cyan-200/70">04 / Verify a record</p>
            <h2 id="verification-heading" className="mt-1 text-lg font-semibold tracking-tight">Compare a proof with this file</h2>
            <p className="mt-1 text-xs leading-5 text-slate-400">Enter a proof ID to compare its stored hash with the selected document’s local hash.</p>
            <div className="mt-4">
              <label htmlFor={`${inputId}-proof-id`} className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Proof ID</label>
              <input id={`${inputId}-proof-id`} value={proofId} onChange={(event) => onProofIdChange(event.target.value)} inputMode="numeric" placeholder="Enter registry proof ID" data-testid="input-proof-id" className="h-10 w-full rounded-lg border border-slate-600/80 bg-slate-950/50 px-3 font-mono text-sm text-slate-100 outline-none transition placeholder:font-sans placeholder:text-slate-600 focus:border-cyan-300/70 focus:ring-2 focus:ring-cyan-300/15" />
            </div>
          </div>
          <button type="button" onClick={onVerify} disabled={!proofId.trim() || verification.state === 'loading'} data-testid="button-verify-proof" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-cyan-200/30 bg-cyan-200/[.07] px-4 text-sm font-semibold text-cyan-100 transition hover:border-cyan-200/60 hover:bg-cyan-200/[.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:cursor-not-allowed disabled:opacity-45">
            {verification.state === 'loading' ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileCheck2 className="h-4 w-4" aria-hidden="true" />}
            {verification.state === 'loading' ? 'Checking proof' : 'Verify proof'}
          </button>
        </div>
        {verification.state !== 'idle' && (
          <div className="mt-5 border-t border-slate-700/70 pt-4" aria-live="polite" data-testid="verification-result">
            <div className="flex flex-wrap items-center gap-3">
              <StatePill tone={verificationTone}>
                {verification.state === 'match' && <Check className="h-3 w-3" aria-hidden="true" />}
                {verification.state === 'loading' ? 'Verifying' : verification.state === 'match' ? 'Hashes match' : verification.state === 'mismatch' ? 'Hash mismatch' : verification.state === 'failed' ? 'Verification failed' : 'Not checked'}
              </StatePill>
              {verification.proofId && <span className="font-mono text-xs text-slate-400">Proof {verification.proofId}</span>}
            </div>
            {verification.message && <p className="mt-3 text-sm text-slate-300" data-testid="verification-message">{verification.message}</p>}
            {(verification.storedHash || verification.localHash) && (
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                <MetaItem label="Stored hash" mono>{verification.storedHash}</MetaItem>
                <MetaItem label="Local file hash" mono>{verification.localHash}</MetaItem>
              </dl>
            )}
            {(verification.label || verification.dataCid || verification.submitter || verification.timestamp || verification.redacted !== undefined) && (
              <dl className="mt-4 grid gap-x-5 gap-y-4 border-t border-slate-700/70 pt-4 sm:grid-cols-2 lg:grid-cols-4">
                <MetaItem label="Public label">{verification.label}</MetaItem>
                <MetaItem label="Data CID" mono>{verification.dataCid}</MetaItem>
                <MetaItem label="Submitter" mono>{verification.submitter}</MetaItem>
                <MetaItem label="Recorded">{verification.timestamp}</MetaItem>
                {verification.redacted !== undefined && <MetaItem label="Redacted">{verification.redacted ? 'Yes' : 'No'}</MetaItem>}
              </dl>
            )}
          </div>
        )}
      </section>
      <p className="pb-2 text-center text-[11px] leading-5 text-slate-500" data-testid="privacy-summary">
        Privacy boundary: document bytes remain local. Only the file hash and metadata you select are written to the public registry, after wallet authorization, confirmation, and event verification.
      </p>
    </main>
  );
}
