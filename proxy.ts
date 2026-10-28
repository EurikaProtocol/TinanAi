import { NextRequest, NextResponse } from 'next/server';

const encoder = new TextEncoder();

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

async function signOwner(ownerId: string, password: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(ownerId)));
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    difference |= (left[index % left.length] ?? 0) ^ (right[index % right.length] ?? 0);
  }
  return difference === 0;
}

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: 'Authentication is required.' }), {
    status: 401,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'WWW-Authenticate': 'Basic realm="TINAN AI", charset="UTF-8"',
    },
  });
}

export async function proxy(request: NextRequest): Promise<Response> {
  if (request.nextUrl.pathname === '/' && (request.method === 'GET' || request.method === 'HEAD')) {
    return NextResponse.next();
  }
  const username = process.env.TINAN_AUTH_USERNAME;
  const password = process.env.TINAN_AUTH_PASSWORD;
  if (!username || !password || username.length > 128 || password.length < 32 || password.length > 4096) {
    return new Response(JSON.stringify({ error: 'Server authentication is not configured.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  if (request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'OPTIONS') {
    const originHeader = request.headers.get('origin') ?? request.headers.get('referer');
    try {
      if (!originHeader || new URL(originHeader).origin !== request.nextUrl.origin) {
        return new Response(JSON.stringify({ error: 'Cross-origin requests are not permitted.' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
      }
    } catch {
      return new Response(JSON.stringify({ error: 'Request origin is invalid.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }
  }

  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0].trim();
  if (process.env.NODE_ENV === 'production' && forwardedProto !== 'https' && request.nextUrl.protocol !== 'https:') {
    return new Response(JSON.stringify({ error: 'HTTPS is required for authenticated production access.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  const authorization = request.headers.get('authorization') ?? '';
  if (!authorization.startsWith('Basic ') || authorization.length > 6000) return unauthorized();

  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(atob(authorization.slice(6)), (character) => character.charCodeAt(0)),
    );
    const separator = decoded.indexOf(':');
    if (separator < 1) return unauthorized();
    const suppliedUsername = decoded.slice(0, separator);
    const suppliedPassword = decoded.slice(separator + 1);
    if (!constantTimeEqual(await digest(suppliedUsername), await digest(username)) ||
        !constantTimeEqual(await digest(suppliedPassword), await digest(password))) {
      return unauthorized();
    }

    const ownerId = Array.from(await digest(username), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const requestHeaders = new Headers(request.headers);
    requestHeaders.delete('authorization');
    requestHeaders.set('x-tinan-owner-id', ownerId);
    requestHeaders.set('x-tinan-owner-proof', await signOwner(ownerId, password));
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    return unauthorized();
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};
