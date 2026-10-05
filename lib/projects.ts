import type { Blueprint } from './blueprint';

export interface SavedProject {
  id: string;
  createdAt: number;
  blueprint: Blueprint;
  chainId?: number;
  owner?: string;
  txHash?: string;
  tokenAddress?: string;
  status: 'draft' | 'deployed';
}

// Local-only registry (browser localStorage). Drafts and deployed records for this browser; the
// on-chain ProjectRegistry contract is the source of truth for deployed projects.
const KEY = 'tinan.projects.v1';

export function loadProjects(): SavedProject[] {
  if (typeof window === 'undefined') return [];
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function saveProject(p: SavedProject) {
  const all = loadProjects().filter((x) => x.id !== p.id);
  all.unshift(p);
  localStorage.setItem(KEY, JSON.stringify(all.slice(0, 200)));
}

export function getProject(id: string) {
  return loadProjects().find((p) => p.id === id);
}

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function loadDraft(): Blueprint | null {
  try {
    return JSON.parse(sessionStorage.getItem('tinan.draft') || 'null');
  } catch {
    return null;
  }
}
export function saveDraft(b: Blueprint) {
  sessionStorage.setItem('tinan.draft', JSON.stringify(b));
}
