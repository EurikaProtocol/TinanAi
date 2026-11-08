import { useEffect, useState } from 'react';
import { Download, FileCode2, LoaderCircle, Sparkles, X } from 'lucide-react';
import { Btn, Card, Textarea } from '@/components/kit';
import type { BuilderFileChange } from '@/lib/builder-file-changes';

export type BuilderAiProposalView = {
  summary: string;
  changes: BuilderFileChange[];
};

type Props = {
  projectName: string;
  prompt: string;
  onPromptChange: (value: string) => void;
  busy: boolean;
  error: string;
  proposal: BuilderAiProposalView | null;
  proposalIsStale: boolean;
  onRequest: () => void;
  onApply: () => void;
  onDiscard: () => void;
  onDownload: () => void;
};

const CHANGE_LABEL: Record<BuilderFileChange['kind'], string> = {
  added: 'Added',
  updated: 'Updated',
  removed: 'Removed',
};
const SOURCE_PREVIEW_LIMIT = 12_000;

function sourcePreview(content: string | undefined, missingMessage: string) {
  if (content === undefined) return missingMessage;
  if (content.length <= SOURCE_PREVIEW_LIMIT) return content;
  return `${content.slice(0, SOURCE_PREVIEW_LIMIT)}\n\n[Preview shortened. Download the proposal ZIP to inspect the complete file.]`;
}

export function BuilderAiImprovementPanel({
  projectName,
  prompt,
  onPromptChange,
  busy,
  error,
  proposal,
  proposalIsStale,
  onRequest,
  onApply,
  onDiscard,
  onDownload,
}: Props) {
  const [selectedPath, setSelectedPath] = useState('');
  const selectedChange = proposal?.changes.find((change) => change.path === selectedPath)
    ?? proposal?.changes[0]
    ?? null;
  const addedCount = proposal?.changes.filter((change) => change.kind === 'added').length ?? 0;
  const updatedCount = proposal?.changes.filter((change) => change.kind === 'updated').length ?? 0;
  const removedCount = proposal?.changes.filter((change) => change.kind === 'removed').length ?? 0;

  useEffect(() => {
    setSelectedPath(proposal?.changes[0]?.path ?? '');
  }, [proposal]);

  return (
    <Card className="space-y-4 border-primary/20 bg-card/90" data-testid="builder-ai-improvement-panel">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/[.08] text-primary">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-primary">AI app editor · {projectName}</p>
          <h2 className="mt-1 text-lg font-semibold">Improve this app with AI</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Describe the change. TINANAI will inspect the current source and prepare a proposal; it will not change your project until you apply it.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="builder-ai-improvement-request" className="text-xs font-semibold">What should change?</label>
        <Textarea
          id="builder-ai-improvement-request"
          rows={3}
          maxLength={4_000}
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          placeholder="For example: add a working search and filter bar, improve the mobile layout, or refine the visual hierarchy."
          disabled={busy}
          data-testid="input-builder-ai-improvement"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] text-muted-foreground">{prompt.length.toLocaleString()} / 4,000 · one AI request per proposal</p>
          <Btn size="sm" variant="gold" disabled={busy || !prompt.trim()} onClick={onRequest} data-testid="button-builder-ai-improve">
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {busy ? 'Preparing proposal…' : 'Prepare AI changes'}
          </Btn>
        </div>
        <p className="rounded-lg border border-border bg-background/40 p-2.5 text-[10px] leading-5 text-muted-foreground">
          Supported text source files are sent as untrusted reference; other files stay unchanged. Source is never executed during generation. Requests use the configured OpenAI integration and may consume Replit AI credits. Preview remains limited to static HTML/CSS/JavaScript.
        </p>
        {error && <p role="alert" className="text-xs leading-5 text-destructive">{error}</p>}
      </div>

      {proposal && (
        <section className="space-y-3 border-t border-border pt-4" aria-live="polite" data-testid="builder-ai-proposal">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
            <div className="min-w-0">
              <h3 className="font-semibold">Review proposed changes</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{proposal.summary}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {addedCount} added · {updatedCount} updated · {removedCount} removed
              </p>
            </div>
            <Btn size="sm" variant="outline" onClick={onDiscard} disabled={busy}>
              <X className="h-3.5 w-3.5" /> Discard
            </Btn>
          </div>

          {proposalIsStale && (
            <p role="alert" className="rounded-lg border border-amber-300/25 bg-amber-300/[.06] p-3 text-xs leading-5 text-amber-100">
              The project changed after this proposal was created. Discard it and request a new proposal to avoid overwriting newer edits.
            </p>
          )}
          {removedCount > 0 && (
            <p className="rounded-lg border border-amber-300/25 bg-amber-300/[.06] p-3 text-xs leading-5 text-amber-100">
              Applying this proposal removes {removedCount} existing {removedCount === 1 ? 'file' : 'files'} that are not in the proposed project.
            </p>
          )}

          {proposal.changes.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">The AI proposal contains no file changes.</p>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-[minmax(220px,.75fr)_minmax(0,1.25fr)]">
                <ul className="max-h-56 space-y-1 overflow-auto rounded-lg border border-border p-2" aria-label="Proposed file changes">
                  {proposal.changes.map((change) => (
                    <li key={change.path}>
                      <button
                        type="button"
                        onClick={() => setSelectedPath(change.path)}
                        className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-xs ${selectedChange?.path === change.path ? 'bg-primary/[.08] text-primary' : 'text-foreground hover:bg-background/70'}`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <FileCode2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span className="truncate font-mono">{change.path}</span>
                        </span>
                        <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide">{CHANGE_LABEL[change.kind]}</span>
                      </button>
                    </li>
                  ))}
                </ul>

                {selectedChange && (
                  <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                    <div className="min-w-0 rounded-lg border border-border bg-background/40 p-2">
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Current source</p>
                      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-4 text-muted-foreground">{sourcePreview(selectedChange.before?.content, 'No existing file with this path.')}</pre>
                    </div>
                    <div className="min-w-0 rounded-lg border border-primary/15 bg-primary/[.025] p-2">
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-primary">Proposed source</p>
                      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-4">{sourcePreview(selectedChange.after?.content, 'This file will be removed.')}</pre>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="max-w-2xl text-[10px] leading-5 text-muted-foreground">
                  Applying replaces the project's complete file set and leaves it unsaved. Review each file or download the complete proposal first.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Btn size="sm" variant="outline" onClick={onDownload} disabled={busy}>
                    <Download className="h-3.5 w-3.5" /> Download proposal ZIP
                  </Btn>
                  <Btn size="sm" variant="gold" onClick={onApply} disabled={busy || proposalIsStale || proposal.changes.length === 0} data-testid="button-apply-ai-changes">
                    Apply all changes
                  </Btn>
                </div>
              </div>
            </>
          )}
        </section>
      )}
    </Card>
  );
}
