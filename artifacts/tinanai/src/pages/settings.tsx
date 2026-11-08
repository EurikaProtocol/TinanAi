import { useRef, useState } from 'react';
import { Download, HardDrive, Trash2, Upload } from 'lucide-react';
import { useGetTinanaiCapabilities } from '@workspace/api-client-react';
import { Btn, Card, Field, Input, PageHeader } from '@/components/kit';
import { download } from '@/lib/helpers';
import { parseWorkspace, useWorkspace } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { LocalizedTree, translateTemplate, useI18n } from '@/lib/i18n';

const capabilityRows = [
  { key: 'aiProvider', label: 'AI provider' },
  { key: 'webSearch', label: 'Web search' },
  { key: 'githubAccess', label: 'GitHub repository access' },
  { key: 'sandboxExecution', label: 'Sandbox execution' },
  { key: 'browserTesting', label: 'Browser testing' },
  { key: 'deploymentIntegrations', label: 'Deployment integrations' },
  { key: 'usageControls', label: 'Usage and cost controls' },
  { key: 'accountOwnership', label: 'Account ownership' },
] as const;

const capabilityStatusStyles = {
  operational: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  limited: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  not_configured: 'border-border bg-muted/40 text-muted-foreground',
} as const;

const capabilityStatusLabels = {
  operational: 'Operational',
  limited: 'Limited',
  not_configured: 'Not configured',
} as const;

export default function Settings() {
  const { locale } = useI18n();
  const capabilities = useGetTinanaiCapabilities();
  const { data, setWorkspaceName, replaceAll, clearAll } = useWorkspace();
  const { toast } = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(data.prefs.workspaceName);
  const onImport = async (f?: File) => {
    if (!f) return;
    try {
      if (f.size > 5 * 1024 * 1024) throw new Error('File too large');
      const raw = JSON.parse(await f.text());
      const imported = parseWorkspace(raw);
      if (!window.confirm(translateTemplate('Importing replaces all current workspace data. Continue?', locale, {}))) return;
      replaceAll(imported); setName(imported.prefs.workspaceName); toast({ title: 'Workspace imported' });
    } catch { toast({ title: 'Import failed', description: 'That file is not a TINANAI export.', variant: 'destructive' }); }
  };
  const counts = [['Projects', data.projects.length], ['Assets', data.assets.length], ['Token plans', data.tokenPlans.length], ['Analyses', data.analyses.length], ['Conversations', data.conversations.length]] as const;
  return (
    <LocalizedTree>
    <div className="max-w-3xl">
      <PageHeader eyebrow="Settings" title="Your workspace" />
      <Card className="mb-5 space-y-3" data-testid="section-capability-status">
        <div>
          <h2 className="font-serif text-2xl">Developer platform status</h2>
          <p className="text-sm text-muted-foreground">Current feature status; no credentials are shown here.</p>
        </div>
        {capabilities.isPending && <div className="h-20 animate-pulse rounded-lg bg-muted/40" aria-hidden="true" />}
        {capabilities.isError && <p role="alert" className="text-sm text-destructive">Capability status is temporarily unavailable.</p>}
        {capabilities.data && (
          <div className="grid gap-3 md:grid-cols-2">
            {capabilityRows.map(({ key, label }) => {
              const capability = capabilities.data[key];
              return (
                <div key={key} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-medium">{label}</h3>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${capabilityStatusStyles[capability.status]}`}>
                      {capabilityStatusLabels[capability.status]}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{capability.detail}</p>
                </div>
              );
            })}
          </div>
        )}
      </Card>
      <Card className="mb-5 border-primary/30" data-testid="notice-local-data">
        <div className="flex gap-4"><HardDrive className="mt-1 h-5 w-5 shrink-0 text-primary" />
          <div><h2 className="font-serif text-2xl">Data lives in this browser</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Projects, assets, token plans, analyses and conversations are saved in your browser's local storage on this device. There is no account and no cloud sync. Clearing site data or switching browser removes them, so export a backup regularly. The only data sent off-device is the text you submit to the assistant, document analysis, builder and tokenization guidance.</p></div></div>
        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5">{counts.map(([k, n]) => <div key={k} className="rounded-lg border border-border p-3"><p className="font-serif text-2xl text-primary">{n}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</p></div>)}</div>
      </Card>
      <Card className="mb-5 space-y-3">
        <h2 className="font-serif text-2xl">Preferences</h2>
        <Field label="Workspace name"><div className="flex gap-2"><Input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} data-testid="input-workspace-name" />
          <Btn variant="gold" disabled={!name.trim()} onClick={() => { setWorkspaceName(name.trim()); toast({ title: 'Workspace renamed' }); }} data-testid="button-save-name">Save</Btn></div></Field>
      </Card>
      <Card className="mb-5 space-y-3">
        <h2 className="font-serif text-2xl">Export and import</h2>
        <p className="text-sm text-muted-foreground">Back up everything as one JSON file, or restore from a previous export.</p>
        <div className="flex flex-wrap gap-2">
          <Btn onClick={() => download('tinanai-workspace.json', JSON.stringify(data, null, 2), 'application/json')} data-testid="button-export-all"><Download className="h-4 w-4" />Export workspace</Btn>
          <input ref={file} type="file" accept="application/json,.json" hidden data-testid="input-import-file" onChange={(e) => { onImport(e.target.files?.[0]); e.target.value = ''; }} />
          <Btn onClick={() => file.current?.click()} data-testid="button-import"><Upload className="h-4 w-4" />Import workspace</Btn>
        </div>
      </Card>
      <Card className="space-y-3 border-destructive/30">
        <h2 className="font-serif text-2xl">Danger zone</h2>
        <p className="text-sm text-muted-foreground">Permanently delete all local workspace data on this device.</p>
        <Btn variant="danger" onClick={() => { if (window.confirm(translateTemplate('Delete all local data? This cannot be undone.', locale, {}))) { clearAll(); setName('My Workspace'); toast({ title: 'Workspace cleared' }); } }} data-testid="button-clear-all"><Trash2 className="h-4 w-4" />Clear all data</Btn>
      </Card>
      <p className="mt-10 text-[10px] leading-relaxed text-muted-foreground">TINANAI workspace data is stored in this browser. AI features depend on the configured provider; no output is simulated.</p>
    </div>
    </LocalizedTree>
  );
}
