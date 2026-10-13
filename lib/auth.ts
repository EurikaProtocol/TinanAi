import { createHmac, timingSafeEqual } from 'node:crypto';

export function getRequestOwnerId(request: Request): string | null {
  const ownerId = request.headers.get('x-tinan-owner-id');
  const proof = request.headers.get('x-tinan-owner-proof');
  const password = process.env.TINAN_AUTH_PASSWORD;
  if (!ownerId || !/^[a-f0-9]{64}$/.test(ownerId) ||
      !proof || !/^[a-f0-9]{64}$/.test(proof) ||
      !password || password.length < 32) return null;
  const expected = createHmac('sha256', password).update(ownerId).digest();
  const supplied = Buffer.from(proof, 'hex');
  return timingSafeEqual(expected, supplied) ? ownerId : null;
}
