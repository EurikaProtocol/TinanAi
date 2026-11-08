import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
// @ts-expect-error Node's native TypeScript test runner loads source files with explicit extensions.
import { createLaunchDraft, exportLaunchDraft, launchDraftFormSchema } from './launchpad.ts';

const validDraft = {
  kind: 'community' as const,
  name: 'Community Sample',
  symbol: 'SAMP',
  description: 'A community token draft.',
  network: 'Ethereum' as const,
  standard: 'ERC-20' as const,
  supply: '1000000',
  decimals: 18,
  distribution: '60% community, 40% treasury.',
  website: '',
  socialLinks: '',
  sourceDescription: '',
  provenance: '',
  issuer: '',
  rights: '',
  accessModel: 'public' as const,
  metadataUri: '',
  integrityHash: '',
};

describe('Launchpad draft validation', () => {
  it('requires provenance, issuer, and rights for data tokens', () => {
    const result = launchDraftFormSchema.safeParse({ ...validDraft, kind: 'data' });
    assert.equal(result.success, false);
    if (!result.success) {
      assert.deepEqual(
        result.error.issues.map((issue) => issue.path[0]).sort(),
        ['issuer', 'provenance', 'rights', 'sourceDescription'].sort(),
      );
    }
  });

  it('rejects unsupported network-standard combinations and non-HTTPS URLs', () => {
    const mismatch = launchDraftFormSchema.safeParse({
      ...validDraft,
      network: 'Solana',
      website: 'javascript:alert(1)',
    });
    assert.equal(mismatch.success, false);
    if (!mismatch.success) {
      assert.ok(mismatch.error.issues.some((issue) => issue.path[0] === 'standard'));
      assert.ok(mismatch.error.issues.some((issue) => issue.path[0] === 'website'));
    }
  });

  it('rejects zero, fractional, and oversized supply values', () => {
    for (const supply of ['0', '2.5', '9'.repeat(61)]) {
      assert.equal(launchDraftFormSchema.safeParse({ ...validDraft, supply }).success, false);
    }
  });

  it('creates an explicitly local draft and exports a non-deployment notice', () => {
    const draft = createLaunchDraft(validDraft, 'draft-1', '2026-10-28T10:00:00.000Z');
    assert.equal(draft.status, 'Draft');
    assert.equal(draft.symbol, 'SAMP');
    assert.match(exportLaunchDraft(draft), /does not connect a wallet or submit a blockchain transaction/i);
  });
});
