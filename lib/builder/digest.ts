import { createHash } from 'node:crypto';

export const BUILDER_CONTRACT_VERSION = '1.1' as const;

export type DigestPlan = { summary: string; technology: string[]; features: string[]; steps: string[] };
export type ManifestFile = { path: string; bytes: number; sha256: string };

const hex = (value: string | Buffer) => `0x${createHash('sha256').update(value).digest('hex')}`;

/**
 * Digest of the exact plan a human reviews. The preimage is part of the published EurekaCore <-> TINAN AI contract
 * (docs/EUREKA_INTEGRATION.md) and must not change without a new contract version.
 */
export function planDigest(plan: DigestPlan): string {
  return hex(JSON.stringify(['eureka.builder-plan.v1', plan.summary, plan.technology, plan.features, plan.steps]));
}

export const contentDigest = (content: string): string => hex(Buffer.from(content, 'utf8'));

export function manifestDigest(planDigestHex: string, files: readonly ManifestFile[]): string {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return hex(JSON.stringify(['eureka.builder-manifest.v1', planDigestHex, sorted.map((f) => [f.path, f.bytes, f.sha256])]));
}

export const isDigest = (value: unknown): value is string => typeof value === 'string' && /^0x[0-9a-f]{64}$/.test(value);
