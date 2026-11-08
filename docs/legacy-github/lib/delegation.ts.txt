const encoder = new TextEncoder();

export const DELEGATION_AUDIENCE = 'tinan-ai';
export const DELEGATION_MAX_TTL_SECONDS = 300;
const SKEW_SECONDS = 30;
const SUBJECT = /^[a-z0-9._@+-]{3,200}$/;

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const b64u = (bytes: Uint8Array) => btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = (text: string) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(data)));
}

/** Stable owner id for a delegated end user. Distinct from the single-owner id (which is sha256 of the Basic-auth username). */
export async function delegatedOwnerId(subject: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(`tinan-delegated-owner:v1:${subject}`))));
}

export async function signDelegation(secret: string, subject: string, nowSeconds: number, ttlSeconds = 120): Promise<string> {
  if (secret.length < 32) throw new Error('Delegation secret must be at least 32 characters.');
  const sub = subject.trim().toLowerCase();
  if (!SUBJECT.test(sub)) throw new Error('Invalid delegation subject.');
  if (!(ttlSeconds > 0 && ttlSeconds <= DELEGATION_MAX_TTL_SECONDS)) throw new Error('Invalid delegation lifetime.');
  const body = `v1.${b64u(encoder.encode(JSON.stringify({ sub, aud: DELEGATION_AUDIENCE, iat: nowSeconds, exp: nowSeconds + ttlSeconds })))}`;
  return `${body}.${toHex(await hmac(secret, body))}`;
}

/** Returns the verified subject or null. Never throws; any problem is a rejection. */
export async function verifyDelegation(secret: string | undefined, token: string, nowSeconds: number): Promise<string | null> {
  try {
    if (!secret || secret.length < 32 || token.length > 1024) return null;
    const [version, payload, signature, extra] = token.split('.');
    if (version !== 'v1' || !payload || !/^[a-f0-9]{64}$/.test(signature ?? '') || extra !== undefined) return null;
    const expected = toHex(await hmac(secret, `v1.${payload}`));
    let diff = 0;
    for (let i = 0; i < 64; i += 1) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    if (diff !== 0) return null;
    const claims = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(fromB64u(payload))) as Record<string, unknown>;
    if (claims.aud !== DELEGATION_AUDIENCE || typeof claims.sub !== 'string' || !SUBJECT.test(claims.sub)) return null;
    const { iat, exp } = claims;
    if (typeof iat !== 'number' || typeof exp !== 'number' || exp - iat <= 0 || exp - iat > DELEGATION_MAX_TTL_SECONDS) return null;
    if (nowSeconds > exp || nowSeconds < iat - SKEW_SECONDS) return null;
    return claims.sub;
  } catch {
    return null;
  }
}
