import { useCallback, useEffect, useState } from 'react';
import { useWeb3Wallet } from './web3-wallet';
import { readDataProjects, writeDataProjects, dataProjectInputSchema, dataProjectStorageKey, type DataProject, type DataProjectInput } from './data-token-projects';

export function useDataProjects() {
  const wallet = useWeb3Wallet();
  const scope = dataProjectStorageKey(wallet.account);
  const [state, setState] = useState<{ scope: string; projects: DataProject[] }>({ scope, projects: [] });
  const [error, setError] = useState<string | null>(null);
  const [storageInvalid, setStorageInvalid] = useState(false);
  const load = useCallback(() => {
    try { setState({ scope, projects: readDataProjects(localStorage, wallet.account) }); setError(null); setStorageInvalid(false); }
    catch { setState({ scope, projects: [] }); setError('Saved projects could not be loaded. They have not been overwritten.'); setStorageInvalid(true); }
  }, [scope, wallet.account]);
  useEffect(() => {
    load();
    const changed = (event: StorageEvent) => { if (event.key === scope || event.key === null) load(); };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [load, scope]);
  const projects = state.scope === scope ? state.projects : [];
  function persist(next: DataProject[]) {
    if (storageInvalid || state.scope !== scope) { setError('Resolve the saved project storage error before making changes.'); return false; }
    try { writeDataProjects(localStorage, next, wallet.account); setState({ scope, projects: next }); setError(null); return true; }
    catch (error) { setError(error instanceof Error ? error.message : 'Projects could not be saved.'); return false; }
  }
  function saveProject(input: DataProjectInput, id?: string) {
    const parsed = dataProjectInputSchema.safeParse(input);
    if (!parsed.success) { setError(parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(' ')); return null; }
    const now = new Date().toISOString();
    const previous = projects.find((project) => project.id === id);
    const project: DataProject = { id: previous?.id ?? crypto.randomUUID(), createdAt: previous?.createdAt ?? now, updatedAt: now, input: parsed.data };
    const next = previous ? projects.map((item) => item.id === project.id ? project : item) : [project, ...projects];
    return persist(next) ? project : null;
  }
  return { projects, error, wallet, scope, saveProject, deleteProject: (id: string) => persist(projects.filter((project) => project.id !== id)) };
}
