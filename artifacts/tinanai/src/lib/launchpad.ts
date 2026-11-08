import { z } from 'zod';
import type { LaunchDraft } from './store';

const httpsUrl = z.string().trim().max(500).refine((value) => {
  if (!value) return true;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}, 'Use a valid HTTPS URL.');

const socialLinks = z.string().max(1000).refine((value) => {
  const links = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return links.every((line) => {
    try {
      return new URL(line).protocol === 'https:';
    } catch {
      return false;
    }
  });
}, 'Use one HTTPS URL per line.');

export const launchDraftFormSchema = z.object({
  kind: z.enum(['community', 'data']),
  name: z.string().trim().min(1, 'Enter a token name.').max(64),
  symbol: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,12}$/, 'Use 2–12 letters or numbers.'),
  description: z.string().trim().min(1, 'Add a description.').max(2000),
  network: z.enum(['Ethereum', 'Polygon', 'Base', 'Solana', 'Undecided']),
  standard: z.enum(['ERC-20', 'SPL Token', 'Undecided']),
  supply: z.string().trim().regex(/^\d{1,60}$/, 'Enter a whole-number supply.').refine((value) => {
    try { return BigInt(value) > 0n; } catch { return false; }
  }, 'Supply must be greater than zero.'),
  decimals: z.number().int().min(0).max(18),
  distribution: z.string().trim().min(1, 'Describe the proposed allocation.').max(2000),
  website: httpsUrl,
  socialLinks,
  sourceDescription: z.string().trim().max(1000),
  provenance: z.string().trim().max(1000),
  issuer: z.string().trim().max(500),
  rights: z.string().trim().max(2000),
  accessModel: z.enum(['public', 'licensed', 'subscription', 'other']),
  metadataUri: httpsUrl,
  integrityHash: z.string().trim().max(128).refine((value) => !value || /^(?:0x)?[a-fA-F0-9]{64}$/.test(value), 'Enter a 32-byte SHA-256 hash.'),
}).superRefine((draft, context) => {
  const expectedStandard = draft.network === 'Solana' ? 'SPL Token' : draft.network === 'Undecided' ? 'Undecided' : 'ERC-20';
  if (draft.standard !== expectedStandard) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['standard'], message: 'The standard must match the selected network.' });
  }
  if (draft.kind === 'data') {
    for (const field of ['sourceDescription', 'provenance', 'issuer', 'rights'] as const) {
      if (!draft[field]) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: 'This field is required for a data token.' });
      }
    }
  }
});

export type LaunchDraftInput = z.infer<typeof launchDraftFormSchema>;

export function createLaunchDraft(
  input: LaunchDraftInput,
  id: string,
  timestamp: string,
): LaunchDraft {
  const validated = launchDraftFormSchema.parse(input);
  return { ...validated, id, status: 'Draft', createdAt: timestamp, updatedAt: timestamp };
}

export function exportLaunchDraft(draft: LaunchDraft): string {
  return JSON.stringify({
    notice: 'This export contains draft settings only. Exporting does not connect a wallet or submit a blockchain transaction.',
    ...draft,
  }, null, 2);
}
