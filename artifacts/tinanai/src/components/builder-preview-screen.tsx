import type { RefObject } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  CircleDashed,
  Code2,
  ExternalLink,
  FileCode2,
  Globe2,
  LoaderCircle,
  Maximize2,
  Play,
  RefreshCw,
  ShieldCheck,
  ShieldX,
  Terminal,
  XCircle,
} from 'lucide-react';
import { Btn, Card, Select } from '@/components/kit';

type CheckStatus = 'not_run' | 'passed' | 'failed' | 'blocked';

type Diagnostic = {
  status: CheckStatus;
  details: string;
  at: string | null;
};

export type BuilderPreviewScreenProps = {
  projectName: string;
  versionLabel: string;
  entryPages: string[];
  activePage: string;
  previewStatus: 'not_run' | 'ready' | 'error';
  build: Diagnostic;
  smoke: Diagnostic;
  checking: boolean;
  loading: boolean;
  loadError: string;
  frameLogs: string[];
  previewSrc: string;
  frameRef: RefObject<HTMLIFrameElement | null>;
  onFrameLoad: () => void;
  onBackToProject: () => void;
  onOpenInEditor: () => void;
  onRefresh: () => void;
  onOpenInNewWindow: () => void;
  onToggleFullscreen: () => void;
  onSelectPage: (path: string) => void;
  onRunStaticChecks: () => void;
  onRunSmokeTest: () => void;
};

const statusCopy: Record<CheckStatus | 'ready' | 'error', string> = {
  not_run: 'Not run',
  passed: 'Passed',
  failed: 'Failed',
  blocked: 'Blocked',
  ready: 'Running',
  error: 'Runtime error',
};

function StatusTag({ status }: { status: CheckStatus | 'ready' | 'error' }) {
  const tone =
    status === 'passed' || status === 'ready'
      ? 'border-emerald-400/25 bg-emerald-400/[.07] text-emerald-200'
      : status === 'failed' || status === 'error'
        ? 'border-rose-400/25 bg-rose-400/[.07] text-rose-200'
        : status === 'blocked'
          ? 'border-amber-300/25 bg-amber-300/[.07] text-amber-100'
          : 'border-border bg-background/40 text-muted-foreground';
  const Icon =
    status === 'passed' || status === 'ready'
      ? CheckCircle2
      : status === 'failed' || status === 'error'
        ? XCircle
        : status === 'blocked'
          ? ShieldX
          : CircleDashed;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wide ${tone}`}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {statusCopy[status]}
    </span>
  );
}

function formatTimestamp(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function DiagnosticPanel({
  title,
  diagnostic,
  fallback,
  icon: Icon,
}: {
  title: string;
  diagnostic: Diagnostic;
  fallback: string;
  icon: LucideIcon;
}) {
  const at = formatTimestamp(diagnostic.at);
  return (
    <section className="rounded-xl border border-border/80 bg-background/35 p-4" aria-label={title}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-primary/15 bg-primary/[.07] text-primary">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="text-xs font-semibold text-foreground">{title}</h3>
            {at && <p className="mt-0.5 text-[10px] text-muted-foreground">Last run {at}</p>}
          </div>
        </div>
        <StatusTag status={diagnostic.status} />
      </div>
      <p className="mt-3 whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">
        {diagnostic.details || fallback}
      </p>
    </section>
  );
}

export function BuilderPreviewScreen({
  projectName,
  versionLabel,
  entryPages,
  activePage,
  previewStatus,
  build,
  smoke,
  checking,
  loading,
  loadError,
  frameLogs,
  previewSrc,
  frameRef,
  onFrameLoad,
  onBackToProject,
  onOpenInEditor,
  onRefresh,
  onOpenInNewWindow,
  onToggleFullscreen,
  onSelectPage,
  onRunStaticChecks,
  onRunSmokeTest,
}: BuilderPreviewScreenProps) {
  const hasSource = Boolean(previewSrc);
  const pageValue = entryPages.includes(activePage) ? activePage : entryPages[0] ?? '';

  return (
    <main className="min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[1680px] flex-col px-4 pb-8 pt-4 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-border/70 pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <Btn
              size="sm"
              variant="ghost"
              onClick={onBackToProject}
              aria-label="Back to project"
              data-testid="button-back-to-project"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Project</span>
            </Btn>
            <span className="h-8 w-px bg-border" aria-hidden="true" />
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-primary/20 bg-primary/[.08] text-primary">
                  <Code2 className="h-4 w-4" aria-hidden="true" />
                </span>
                <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg" data-testid="text-preview-project-name">
                  {projectName}
                </h1>
              </div>
              <p className="ml-10 mt-0.5 text-[10px] font-medium uppercase tracking-[.13em] text-muted-foreground">
                Full-page preview <span className="mx-1.5 text-border">/</span> {versionLabel}
              </p>
            </div>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
            <Btn size="sm" onClick={onOpenInEditor} data-testid="button-open-in-editor">
              <FileCode2 className="h-3.5 w-3.5" aria-hidden="true" />
              Open editor
            </Btn>
            <Btn size="sm" variant="gold" onClick={onOpenInNewWindow} disabled={!hasSource || loading || Boolean(loadError)} data-testid="button-open-preview-new-window">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Open separately</span>
              <span className="sm:hidden">Open</span>
            </Btn>
          </div>
        </header>

        {loadError && (
          <div role="alert" className="mb-5 rounded-xl border border-rose-300/25 bg-rose-300/[.06] px-4 py-3 text-sm text-rose-100" data-testid="text-preview-load-error">
            {loadError}
          </div>
        )}

        <div className="grid flex-1 content-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="min-w-0" aria-label="Project preview">
            <Card className="overflow-hidden p-0 shadow-[0_22px_70px_rgba(1,8,22,.22)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/90 px-4 py-3 sm:px-5">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex items-center gap-1.5" aria-label="Preview window controls">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-300/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-200/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-300/70" />
                  </div>
                  <span className="hidden h-5 w-px bg-border sm:block" />
                  <span className="flex items-center gap-1.5 rounded-md border border-emerald-300/15 bg-emerald-300/[.045] px-2 py-1 text-[9px] font-semibold uppercase tracking-[.12em] text-emerald-100/80">
                    <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                    Sandboxed
                  </span>
                  <StatusTag status={previewStatus} />
                </div>
                <div className="flex w-full items-center gap-2 sm:w-auto">
                  <label htmlFor="preview-entry-page" className="sr-only">Preview page</label>
                  <div className="relative min-w-0 flex-1 sm:w-56 sm:flex-none">
                    <Globe2 className="pointer-events-none absolute left-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Select
                      id="preview-entry-page"
                      aria-label="Select preview page"
                      value={pageValue}
                      onChange={(event) => onSelectPage(event.target.value)}
                      disabled={!entryPages.length}
                      className="h-9 pl-9 pr-8 font-mono text-xs"
                      data-testid="select-preview-page"
                    >
                      {entryPages.length ? entryPages.map((page) => (
                        <option key={page} value={page}>{page}</option>
                      )) : <option value="">No entry pages</option>}
                    </Select>
                  </div>
                  <button
                    type="button"
                    onClick={onRefresh}
                    aria-label="Refresh preview"
                    title="Refresh preview"
                    data-testid="button-refresh-preview"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border text-muted-foreground transition hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={onToggleFullscreen}
                    aria-label="Toggle preview fullscreen"
                    title="Toggle fullscreen"
                    data-testid="button-toggle-preview-fullscreen"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border text-muted-foreground transition hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Maximize2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="relative min-h-[58vh] bg-[#f4f7f9] sm:min-h-[68vh] xl:min-h-[calc(100dvh-220px)]">
                {hasSource ? (
                  <iframe
                    ref={frameRef}
                    title={`${projectName} project preview`}
                    sandbox="allow-scripts"
                    srcDoc={previewSrc}
                    onLoad={onFrameLoad}
                    className="absolute inset-0 h-full min-h-[58vh] w-full border-0 bg-[#f4f7f9] sm:min-h-[68vh] xl:min-h-[calc(100dvh-220px)]"
                    data-testid="iframe-project-preview"
                  />
                ) : (
                   <div className="knowledge-grid absolute inset-0 grid place-items-center p-6 text-center text-slate-900">
                    <div className="max-w-md">
                      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-primary/20 bg-primary/[.07] text-primary">
                        {entryPages.length ? <LoaderCircle className="h-6 w-6" aria-hidden="true" /> : <FileCode2 className="h-6 w-6" aria-hidden="true" />}
                      </span>
                      <p className="mt-5 text-[10px] font-bold uppercase tracking-[.2em] text-primary">
                         {loadError ? 'Preview unavailable' : loading ? 'Loading saved source' : entryPages.length ? 'Preview source pending' : 'No entry page'}
                      </p>
                       <h2 className="mt-2 font-serif text-2xl text-slate-900 sm:text-3xl">
                         {loadError ? 'Project source could not be opened' : loading ? 'Preparing the saved source' : entryPages.length ? 'Preparing the saved source' : 'There is nothing to render yet'}
                      </h2>
                       <p className="mt-2 text-sm leading-6 text-slate-600">
                         {loadError || (loading
                           ? 'Loading the latest saved project version.'
                           : entryPages.length
                             ? 'The selected project has no usable HTML entry page. Return to the editor to inspect its saved files.'
                             : 'Add an HTML entry page in the project editor, then come back to see it in this isolated preview.')}
                      </p>
                      <Btn className="mt-5" onClick={onOpenInEditor} data-testid="button-empty-preview-editor">
                        <FileCode2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Open project editor
                      </Btn>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2 border-t border-border bg-background/40 px-4 py-3 text-[10px] leading-5 text-muted-foreground sm:flex-row sm:items-start sm:px-5">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                <p>
                  This is a static HTML/CSS/JavaScript preview in a sandboxed iframe. It has no same-origin access, network, app APIs, persistence, React/Vite runtime, backend, database, or local binary assets. Client-side interactions can run, but saved app data and server-dependent features are unavailable. Publish is unavailable until a per-project deployment target is connected; this browser sandbox has no enforced CPU or memory quotas.
                </p>
              </div>
            </Card>
          </section>

          <aside className="space-y-4" aria-label="Preview diagnostics">
            <div className="flex items-end justify-between gap-3 px-1">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.18em] text-primary">Project health</p>
                <h2 className="mt-1 font-semibold tracking-tight">Diagnostics</h2>
              </div>
              <span className="font-mono text-[10px] text-muted-foreground">{versionLabel}</span>
            </div>

            <Card className="space-y-3 p-4">
              <DiagnosticPanel
                title="Static checks"
                diagnostic={build}
                icon={ShieldCheck}
                fallback="Checks the saved entry file, safe paths, file limits, and local references."
              />
              <Btn
                size="sm"
                variant="gold"
                className="w-full"
                onClick={onRunStaticChecks}
                disabled={loading || Boolean(loadError)}
                data-testid="button-run-static-checks"
              >
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Run static checks
              </Btn>
              <div className="border-t border-border/70" />
              <DiagnosticPanel
                title="Browser smoke test"
                diagnostic={smoke}
                icon={Play}
                fallback="Checks the initial iframe load and captures runtime errors. This is not exhaustive."
              />
              <Btn
                size="sm"
                className="w-full"
                onClick={onRunSmokeTest}
                disabled={checking || loading || Boolean(loadError) || !hasSource}
                aria-busy={checking || loading}
                data-testid="button-run-smoke-test"
              >
                {checking
                  ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
                {checking ? 'Waiting for preview…' : 'Run smoke test'}
              </Btn>
            </Card>

            <Card className="overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h3 className="flex items-center gap-2 text-xs font-semibold">
                  <Terminal className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  Runtime console
                </h3>
                <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground" aria-label={`${frameLogs.length} console messages`}>
                  {frameLogs.length}
                </span>
              </div>
              <div
                className="knowledge-scroll max-h-56 min-h-24 space-y-2 overflow-y-auto bg-background/80 p-4 font-mono text-[10px] leading-5"
                aria-live="polite"
                aria-label="Runtime console messages"
                data-testid="list-runtime-console"
              >
                {frameLogs.length ? frameLogs.map((line, index) => (
                  <p key={`${index}-${line}`} className={`break-words ${line.startsWith('Error:') ? 'text-rose-200' : line.startsWith('Warning:') ? 'text-amber-100' : 'text-muted-foreground'}`}>
                    <span className="mr-2 select-none text-muted-foreground/50">{String(index + 1).padStart(2, '0')}</span>
                    {line}
                  </p>
                )) : (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Check className="h-3 w-3 text-emerald-300/70" aria-hidden="true" />
                    No runtime messages captured.
                  </p>
                )}
              </div>
            </Card>

            <p className="px-1 text-[10px] leading-5 text-muted-foreground/80">
              Static checks are not a production build. The smoke test covers one initial browser load only; server execution, packages, and network services are not supported.
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}

export default BuilderPreviewScreen;
