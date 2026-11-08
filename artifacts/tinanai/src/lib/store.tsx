import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { z } from 'zod';

export interface Project {
  id: string; name: string; description: string; html: string; createdAt: string; updatedAt: string;
  files?: { path: string; content: string; mediaType: string }[];
  versions?: { id: string; summary: string; files: { path: string; content: string; mediaType: string }[]; createdAt: string }[];
  appType?: 'web_app' | 'dashboard' | 'task_manager' | 'landing_page';
  template?: 'ai_generated' | 'blank' | 'task_manager' | 'dashboard';
  previewStatus?: 'not_run' | 'ready' | 'error';
  buildStatus?: 'not_run' | 'passed' | 'failed' | 'blocked';
  buildDetails?: string | null;
  buildAt?: string | null;
  testStatus?: 'not_run' | 'passed' | 'failed' | 'blocked';
  testDetails?: string | null;
  testAt?: string | null;
}
export interface Asset { id: string; name: string; type: string; description: string; value: number; status: string; createdAt: string }
export interface TokenPlan { id: string; assetId: string; name: string; symbol: string; network: string; standard: string; supply: number; decimals: number; description: string; status: string; createdAt: string }
export interface LaunchDraft {
  id: string;
  kind: 'community' | 'data';
  name: string;
  symbol: string;
  description: string;
  network: 'Ethereum' | 'Polygon' | 'Base' | 'Solana' | 'Undecided';
  standard: 'ERC-20' | 'SPL Token' | 'Undecided';
  supply: string;
  decimals: number;
  mintable?: boolean;
  burnable?: boolean;
  distribution: string;
  website: string;
  socialLinks: string;
  sourceDescription: string;
  provenance: string;
  issuer: string;
  rights: string;
  accessModel: 'public' | 'licensed' | 'subscription' | 'other';
  metadataUri: string;
  integrityHash: string;
  status: 'Draft';
  createdAt: string;
  updatedAt: string;
}
export interface SavedAnalysis { id: string; name: string; goal: string; result: string; createdAt: string }
export interface Message { role: 'user' | 'assistant'; content: string }
export interface Conversation { id: string; title: string; messages: Message[]; updatedAt: string; greenLeafMode?: boolean }
export interface Workspace {
  projects: Project[]; assets: Asset[]; tokenPlans: TokenPlan[]; launchDrafts: LaunchDraft[]; analyses: SavedAnalysis[]; conversations: Conversation[];
  prefs: { workspaceName: string };
}
type ListKey = 'projects' | 'assets' | 'tokenPlans' | 'launchDrafts' | 'analyses' | 'conversations';

const KEY = 'tinanai.workspace.v1';
export const emptyWorkspace = (): Workspace => ({ projects: [], assets: [], tokenPlans: [], launchDrafts: [], analyses: [], conversations: [], prefs: { workspaceName: 'My Workspace' } });
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
export const now = () => new Date().toISOString();

const id = z.string().min(1);
const timestamp = z.string().datetime();
const workspaceSchema = z.object({
  projects: z.array(z.object({
    id, name: z.string(), description: z.string(), html: z.string(), createdAt: timestamp, updatedAt: timestamp,
    files: z.array(z.object({ path: z.string(), content: z.string(), mediaType: z.string() })).optional(),
    versions: z.array(z.object({
      id, summary: z.string(),
      files: z.array(z.object({ path: z.string(), content: z.string(), mediaType: z.string() })),
      createdAt: timestamp,
    })).optional(),
    appType: z.enum(['web_app', 'dashboard', 'task_manager', 'landing_page']).optional(),
    template: z.enum(['ai_generated', 'blank', 'task_manager', 'dashboard']).optional(),
    previewStatus: z.enum(['not_run', 'ready', 'error']).optional(),
    buildStatus: z.enum(['not_run', 'passed', 'failed', 'blocked']).optional(),
    buildDetails: z.string().nullable().optional(),
    buildAt: timestamp.nullable().optional(),
    testStatus: z.enum(['not_run', 'passed', 'failed', 'blocked']).optional(),
    testDetails: z.string().nullable().optional(),
    testAt: timestamp.nullable().optional(),
  })),
  assets: z.array(z.object({ id, name: z.string(), type: z.string(), description: z.string(), value: z.number().finite().nonnegative(), status: z.string(), createdAt: timestamp })),
  tokenPlans: z.array(z.object({ id, assetId: z.string(), name: z.string(), symbol: z.string(), network: z.string(), standard: z.string(), supply: z.number().finite().positive(), decimals: z.number().int().min(0).max(18), description: z.string(), status: z.string(), createdAt: timestamp })),
  launchDrafts: z.array(z.object({
    id, kind: z.enum(['community', 'data']), name: z.string().min(1).max(64),
    symbol: z.string().min(2).max(12), description: z.string().max(2000),
    network: z.enum(['Ethereum', 'Polygon', 'Base', 'Solana', 'Undecided']),
    standard: z.enum(['ERC-20', 'SPL Token', 'Undecided']),
    supply: z.string().regex(/^\d{1,60}$/), decimals: z.number().int().min(0).max(18),
    mintable: z.boolean().optional(), burnable: z.boolean().optional(),
    distribution: z.string().max(2000), website: z.string().max(500), socialLinks: z.string().max(1000),
    sourceDescription: z.string().max(1000), provenance: z.string().max(1000), issuer: z.string().max(500),
    rights: z.string().max(2000), accessModel: z.enum(['public', 'licensed', 'subscription', 'other']),
    metadataUri: z.string().max(500), integrityHash: z.string().max(128), status: z.literal('Draft'),
    createdAt: timestamp, updatedAt: timestamp,
  })).default([]),
  analyses: z.array(z.object({ id, name: z.string(), goal: z.string(), result: z.string(), createdAt: timestamp })),
  conversations: z.array(z.object({ id, title: z.string(), messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() })), updatedAt: timestamp, greenLeafMode: z.boolean().optional() })),
  prefs: z.object({ workspaceName: z.string().min(1).max(40) }),
});

export function parseWorkspace(raw: unknown): Workspace {
  return workspaceSchema.parse(raw);
}
export function normalize(raw: unknown): Workspace {
  if (raw == null) return emptyWorkspace();
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && !('launchDrafts' in raw)) {
    return parseWorkspace({ ...raw, launchDrafts: [] });
  }
  return parseWorkspace(raw);
}
function load(): { data: Workspace; error: string | null } {
  try { return { data: normalize(JSON.parse(localStorage.getItem(KEY) || 'null')), error: null }; }
  catch { return { data: emptyWorkspace(), error: 'Saved data could not be read. It has not been overwritten. Restore a valid backup in Settings before continuing.' }; }
}

interface Ctx {
  data: Workspace;
  storageError: string | null;
  upsert: <K extends ListKey>(key: K, item: Workspace[K][number]) => void;
  remove: (key: ListKey, id: string) => void;
  setWorkspaceName: (n: string) => void;
  replaceAll: (w: Workspace) => void;
  clearAll: () => void;
}
const C = createContext<Ctx | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [loaded] = useState(load);
  const [data, setData] = useState<Workspace>(loaded.data);
  const [storageError, setStorageError] = useState<string | null>(loaded.error);
  const [canPersist, setCanPersist] = useState(!loaded.error);
  useEffect(() => {
    if (!canPersist) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      setStorageError(null);
    } catch {
      setStorageError('Your latest changes could not be saved in this browser. Use Settings to export a backup before closing this tab.');
    }
  }, [data, canPersist]);
  const upsert = useCallback(<K extends ListKey>(key: K, item: Workspace[K][number]) => {
    setData((d) => {
      const list = d[key] as { id: string }[];
      const it = item as { id: string };
      const next = list.some((x) => x.id === it.id) ? list.map((x) => (x.id === it.id ? it : x)) : [it, ...list];
      return { ...d, [key]: next };
    });
  }, []);
  const remove = useCallback((key: ListKey, id: string) => setData((d) => ({ ...d, [key]: (d[key] as { id: string }[]).filter((x) => x.id !== id) })), []);
  const setWorkspaceName = useCallback((n: string) => setData((d) => ({ ...d, prefs: { ...d.prefs, workspaceName: n } })), []);
  const replaceAll = useCallback((w: Workspace) => { const valid = parseWorkspace(w); setData(valid); setCanPersist(true); }, []);
  const clearAll = useCallback(() => { setData(emptyWorkspace()); setCanPersist(true); }, []);
  const v = useMemo(() => ({ data, storageError, upsert, remove, setWorkspaceName, replaceAll, clearAll }), [data, storageError, upsert, remove, setWorkspaceName, replaceAll, clearAll]);
  return <C.Provider value={v}>
    {children}
    {storageError && <div role="alert" aria-live="assertive" data-testid="alert-local-storage" className="fixed bottom-20 left-4 right-4 z-[100] rounded-xl border border-destructive/50 bg-card p-4 text-sm text-foreground shadow-xl md:bottom-4 md:left-auto md:max-w-md">{storageError}</div>}
  </C.Provider>;
}
export function useWorkspace() {
  const c = useContext(C);
  if (!c) throw new Error('WorkspaceProvider missing');
  return c;
}
