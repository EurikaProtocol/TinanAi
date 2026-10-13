export function getRequestOwnerId(request: Request): string | null {
  const ownerId = request.headers.get('x-tinan-owner-id');
  return ownerId && /^[a-f0-9]{64}$/.test(ownerId) ? ownerId : null;
}
