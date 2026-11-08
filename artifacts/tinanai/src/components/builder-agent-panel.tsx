import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/react';
import {
  Activity, Bot, CircleAlert, LoaderCircle, Play, ShieldCheck, Square,
} from 'lucide-react';
import {
  getGetTinanaiBuilderAgentRunQueryKey,
  getListTinanaiBuilderAgentRunsQueryKey,
  useCancelTinanaiBuilderAgentRun,
  useCreateTinanaiBuilderAgentRun,
  useGetTinanaiBuilderAgentRun,
  useListTinanaiBuilderAgentRuns,
} from '@workspace/api-client-react';
import type {
  TinanaiBuilderAgentFinding,
  TinanaiBuilderAgentRunSummary,
} from '@workspace/api-client-react';
import { Btn, Card, Textarea } from '@/components/kit';

type Props = {
  projectId: string | null;
  projectName: string;
  hasUnsavedChanges: boolean;
};

const active = (status: string) => status === 'queued' || status === 'running';
const formatDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

function RunStatus({ status }: { status: string }) {
  return (
    <span className="rounded-full border border-primary/20 bg-primary/[.06] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">
      {status.replaceAll('_', ' ')}
    </span>
  );
}

export function BuilderAgentPanel({ projectId, projectName, hasUnsavedChanges }: Props) {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState('');
  const [selectedRunId, setSelectedRunId] = useState('');
  const listQuery = useListTinanaiBuilderAgentRuns(projectId ?? '', {
    query: {
      enabled: !!projectId,
      queryKey: [...getListTinanaiBuilderAgentRunsQueryKey(projectId ?? ''), userId],
      refetchInterval: (query) =>
        query.state.data?.runs.some((run) => active(run.status)) ? 1800 : false,
    },
  });
  const runs = listQuery.data?.runs ?? [];
  const selectedId = selectedRunId || runs[0]?.id || '';
  const detailQuery = useGetTinanaiBuilderAgentRun(projectId ?? '', selectedId, {
    query: {
      enabled: !!projectId && !!selectedId,
      queryKey: [...getGetTinanaiBuilderAgentRunQueryKey(projectId ?? '', selectedId), userId],
      refetchInterval: (query) =>
        query.state.data && active(query.state.data.run.status) ? 1400 : false,
    },
  });
  const createRun = useCreateTinanaiBuilderAgentRun();
  const cancelRun = useCancelTinanaiBuilderAgentRun();
  const detail = detailQuery.data;
  const latestRun = detail?.run;
  const architectTask = detail?.tasks.find((task) => task.role === 'master_architect');
  const securityTask = detail?.tasks.find((task) => task.role === 'security_engineer');
  const workItems = detail?.tasks.filter((task) => task.taskType === 'work_item') ?? [];
  const findings = useMemo(() => {
    const value = securityTask?.result?.findings;
    return Array.isArray(value) ? value as TinanaiBuilderAgentFinding[] : [];
  }, [securityTask?.result]);
  const disabledReason = !projectId
    ? 'Save this project to your account to start a persisted engineering run.'
    : hasUnsavedChanges
      ? 'Save your source changes first so the agents inspect the current project version.'
      : '';

  const startRun = async () => {
    if (!projectId || disabledReason || !prompt.trim()) return;
    try {
      const response = await createRun.mutateAsync({
        id: projectId,
        data: { prompt: prompt.trim() },
      });
      setPrompt('');
      setSelectedRunId(response.run.id);
      await queryClient.invalidateQueries({
        queryKey: [...getListTinanaiBuilderAgentRunsQueryKey(projectId), userId],
      });
    } catch (error) {
      // The generated mutation already exposes the server error in the panel below.
    }
  };

  const stopRun = async (run: TinanaiBuilderAgentRunSummary) => {
    if (!projectId) return;
    try {
      await cancelRun.mutateAsync({ id: projectId, runId: run.id });
      await queryClient.invalidateQueries({
        queryKey: [...getListTinanaiBuilderAgentRunsQueryKey(projectId), userId],
      });
    } catch {
      await detailQuery.refetch();
    }
  };

  return (
    <Card className="space-y-4 border-primary/15 bg-card/90" data-testid="builder-agent-panel">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/[.08] text-primary">
            <Bot className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.16em] text-primary">Engineering run · {projectName}</p>
            <h2 className="mt-1 text-lg font-semibold">Master Orchestrator</h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
              Creates a reviewable plan and runs defensive static source checks. It does not edit files, run project code, or claim build/test results.
            </p>
          </div>
        </div>
        {latestRun && active(latestRun.status) && (
          <Btn
            size="sm"
            variant="outline"
            disabled={cancelRun.isPending}
            onClick={() => void stopRun(latestRun)}
            aria-label="Cancel active engineering run"
          >
            {cancelRun.isPending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3 w-3" />}
            Cancel
          </Btn>
        )}
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(260px,.8fr)]">
        <div className="space-y-2">
          <label htmlFor="builder-agent-request" className="text-xs font-semibold">What should the agents plan?</label>
          <Textarea
            id="builder-agent-request"
            rows={3}
            maxLength={4000}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Describe the change or question for this saved project…"
            disabled={!projectId || !!disabledReason || createRun.isPending}
            className="text-sm"
          />
          {disabledReason && <p className="text-xs text-amber-200/90">{disabledReason}</p>}
          {createRun.isError && <p role="alert" className="text-xs text-destructive">{createRun.error instanceof Error ? createRun.error.message : 'The run could not be started.'}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] text-muted-foreground">{prompt.length.toLocaleString()} / 4,000 · 1 AI call per run</p>
            <Btn
              size="sm"
              variant="gold"
              disabled={!projectId || !!disabledReason || !prompt.trim() || createRun.isPending}
              onClick={() => void startRun()}
            >
              {createRun.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Start review-only run
            </Btn>
          </div>
          <p className="rounded-lg border border-border bg-background/40 p-2.5 text-[10px] leading-5 text-muted-foreground">
            The request, project metadata, and a bounded, secret-redacted source snapshot are sent to Replit OpenAI. Calls use your Replit credits. Each run makes one bounded planning call; no source changes or project-code execution occur.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold">Saved runs</h3>
            <button
              type="button"
              className="text-[10px] text-primary underline-offset-2 hover:underline"
              onClick={() => void listQuery.refetch()}
            >
              Refresh
            </button>
          </div>
          {listQuery.isLoading ? (
            <div className="flex items-center gap-2 rounded-lg border border-border p-3 text-xs text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading runs…</div>
          ) : listQuery.isError ? (
            <div role="alert" className="rounded-lg border border-destructive/20 p-3 text-xs text-muted-foreground">Run history could not be loaded.</div>
          ) : runs.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">No engineering runs for this project yet.</p>
          ) : (
            <div className="max-h-36 space-y-1 overflow-auto">
              {runs.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => setSelectedRunId(run.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left ${run.id === selectedId ? 'border-primary/30 bg-primary/[.06]' : 'border-border hover:bg-background/60'}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium">{run.summary || run.request}</span>
                    <span className="mt-1 block text-[10px] text-muted-foreground">{formatDate(run.createdAt)}</span>
                  </span>
                  <RunStatus status={run.status} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {latestRun && (
        <section className="space-y-3 border-t border-border pt-3" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
              <h3 className="text-sm font-semibold">Run report</h3>
              <RunStatus status={latestRun.status} />
            </div>
            <span className="text-[10px] text-muted-foreground">
              {latestRun.inputTokens + latestRun.outputTokens} tokens · saved to this project
            </span>
          </div>
          {latestRun.status === 'queued' || latestRun.status === 'running' ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Agents are working. This panel refreshes automatically.</p>
          ) : null}
          {latestRun.summary && <p className="text-sm leading-6">{latestRun.summary}</p>}
          {latestRun.plan && (
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,.8fr)]">
              <div className="space-y-2 rounded-lg border border-border bg-background/35 p-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-semibold">Architecture · {latestRun.plan.complexity} complexity</h4>
                  <span className="text-[10px] text-muted-foreground">{architectTask?.status ?? 'planned'}</span>
                </div>
                <p className="text-xs leading-5 text-muted-foreground">{latestRun.plan.architecture}</p>
                <h5 className="pt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Planned work items</h5>
                <ul className="space-y-2">
                  {workItems.map((task) => (
                    <li key={task.id} className="rounded-md border border-border/80 p-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-semibold">{task.title}</span>
                        <span className="text-[10px] text-muted-foreground">{task.role.replaceAll('_', ' ')} · {task.executorAvailable ? 'worker available' : 'worker not available'}</span>
                      </div>
                      <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{task.description}</p>
                      {task.dependsOn.length > 0 && <p className="mt-1 text-[10px] text-muted-foreground">Depends on: {task.dependsOn.join(', ')}</p>}
                    </li>
                  ))}
                </ul>
                {latestRun.plan.risks.length > 0 && (
                  <div className="mt-3 flex gap-2 rounded-md border border-amber-300/20 bg-amber-300/[.05] p-2.5 text-[11px] leading-5 text-amber-100/90">
                    <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{latestRun.plan.risks.join(' ')}</span>
                  </div>
                )}
              </div>
              <div className="space-y-2 rounded-lg border border-border bg-background/35 p-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="flex items-center gap-2 text-xs font-semibold"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> Static security review</h4>
                  <span className="text-[10px] text-muted-foreground">{securityTask?.status ?? 'queued'}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">Defensive pattern checks only; not a security audit or code execution.</p>
                {findings.length === 0 ? (
                  <p className="rounded-md border border-border p-2.5 text-xs text-muted-foreground">
                    {securityTask?.status === 'completed' ? 'No findings from the limited static checks.' : 'Waiting for the static reviewer.'}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {findings.map((finding, index) => (
                      <li key={`${finding.path}-${finding.category}-${index}`} className="rounded-md border border-border p-2.5">
                        <p className="text-xs font-semibold">{finding.severity.toUpperCase()} · {finding.category}</p>
                        <p className="mt-1 font-mono text-[10px] text-muted-foreground">{finding.path}</p>
                        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{finding.summary}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
          {detail?.events.length ? (
            <details className="rounded-lg border border-border bg-background/25 p-3">
              <summary className="cursor-pointer text-xs font-medium">Execution log ({detail.events.length})</summary>
              <ol className="mt-3 space-y-2">
                {detail.events.map((event) => (
                  <li key={event.id} className="flex flex-wrap justify-between gap-2 text-[10px] leading-5 text-muted-foreground">
                    <span>{event.message}</span><time>{formatDate(event.createdAt)}</time>
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
          <p className="text-[10px] leading-5 text-muted-foreground">
            This run ends at plan review. Planned work items are not executable yet; no build, test, GitHub, deployment, or EUREKA verification was performed.
          </p>
        </section>
      )}
    </Card>
  );
}
