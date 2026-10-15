import { NextResponse } from 'next/server';

const DEFAULT_API_BASE_URL = 'http://localhost:7071/api';

function apiUrl(path: string): URL {
  const configured = process.env.BANKING_API_BASE_URL || DEFAULT_API_BASE_URL;
  const base = new URL(configured);
  if (base.protocol !== 'https:' && base.hostname !== 'localhost') {
    throw new Error('BANKING_API_BASE_URL must use HTTPS outside local development.');
  }
  return new URL(path.replace(/^\/+/u, ''), `${base.toString().replace(/\/+$/u, '')}/`);
}

export async function forwardApiRequest(
  request: Request,
  path: string,
  method = request.method,
  body?: string,
): Promise<Response> {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Sign in with your organization account first.' }, { status: 401 });
  }

  try {
    const upstream = await fetch(apiUrl(path), {
      method,
      headers: {
        authorization,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body } : {}),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    const contentType = upstream.headers.get('content-type') || 'application/json';
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'content-type': contentType,
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Banking API request failed', error);
    return NextResponse.json(
      { error: 'The banking API is unreachable. Check its deployment and configured base URL.' },
      { status: 502 },
    );
  }
}
