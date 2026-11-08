// Pure, node-compatible helpers for payment readiness UI. No React, no env access.
export const MIN_CONFIRMATIONS = 12;
export const MAX_CONFIRMATIONS = 100;

export type CheckStatus = 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT_TESTED';

export function confirmationsError(value: unknown, network: string): string | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < MIN_CONFIRMATIONS || value > MAX_CONFIRMATIONS) {
    return `Confirmations must be a whole number from ${MIN_CONFIRMATIONS} to ${MAX_CONFIRMATIONS} on ${network}.`;
  }
  return null;
}

export const STATUS_LABEL: Record<CheckStatus, string> = { PASS: 'PASS', FAIL: 'FAIL', BLOCKED: 'BLOCKED', NOT_TESTED: 'NOT TESTED' };

export function countChecks(checks: { status: CheckStatus; mandatory: boolean }[]) {
  const c = { PASS: 0, FAIL: 0, BLOCKED: 0, NOT_TESTED: 0, mandatoryOpen: 0 };
  for (const k of checks) { c[k.status] += 1; if (k.mandatory && k.status !== 'PASS') c.mandatoryOpen += 1; }
  return c;
}

/** tokenVerified null = unknown (no known address or not verified). Never means "no token exists". */
export function tokenStateLabel(v: boolean | null): string {
  if (v === true) return 'Verified exact token';
  if (v === false) return 'Verification failed';
  return 'Unknown: no verified known address';
}
