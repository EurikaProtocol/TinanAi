import { getCloudflareContext } from '@opennextjs/cloudflare';

export type D1Result<T = unknown> = {
  results?: T[];
  meta?: { changes?: number };
};

export type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
};

export type D1Database = {
  prepare(query: string): D1Statement;
};

export type R2Object = {
  text(): Promise<string>;
};

export type R2Bucket = {
  put(key: string, value: string): Promise<unknown>;
  get(key: string): Promise<R2Object | null>;
  delete(key: string | string[]): Promise<void>;
};

export type ProjectStorageBindings = {
  TINAN_DB: D1Database;
  TINAN_PROJECT_FILES: R2Bucket;
};

type StorageGlobal = typeof globalThis & {
  tinanProjectStorageTestResolver?: () => ProjectStorageBindings | Promise<ProjectStorageBindings>;
};

const storageGlobal = globalThis as StorageGlobal;

export function setProjectStorageTestResolver(
  resolver: (() => ProjectStorageBindings | Promise<ProjectStorageBindings>) | undefined,
): void {
  storageGlobal.tinanProjectStorageTestResolver = resolver;
}

export async function getProjectStorageBindings(): Promise<ProjectStorageBindings> {
  const injected = storageGlobal.tinanProjectStorageTestResolver;
  const bindings = injected
    ? await injected()
    : (await getCloudflareContext({ async: true })).env as unknown as Partial<ProjectStorageBindings>;
  if (!bindings.TINAN_DB || !bindings.TINAN_PROJECT_FILES) {
    throw new Error('Durable project storage is not configured. Bind TINAN_DB and TINAN_PROJECT_FILES.');
  }
  return bindings as ProjectStorageBindings;
}
