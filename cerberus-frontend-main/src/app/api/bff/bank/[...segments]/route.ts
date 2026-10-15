import { NextRequest, NextResponse } from 'next/server';
import { forwardApiRequest } from '@/lib/bff/upstream';

const routes: Record<string, readonly string[]> = {
  'security/alerts': ['GET'],
  'security/audit/public-key': ['GET'],
  'security/canaries': ['POST'],
  'security/compliance/audit': ['GET'],
  'security/compliance/decrypt': ['POST'],
  'security/crypto/registry': ['GET'],
  'security/dashboard/telemetry': ['GET'],
  'security/devices/actions': ['GET'],
  'security/devices/actions/decide': ['POST'],
  'security/devices/actions/request': ['POST'],
  'security/devices/compliance/demo': ['GET', 'POST'],
  'security/devices/revoke': ['POST'],
  'security/quarantine/release': ['POST'],
  'escrow/public-key': ['GET'],
  'keys/message': ['POST'],
  'passkeys/auth/options': ['POST'],
  'passkeys/auth/verify': ['POST'],
  'passkeys/register/options': ['POST'],
  'passkeys/register/verify': ['POST'],
};

function isAllowedRoute(path: string, method: string): boolean {
  if (routes[path]?.includes(method)) return true;
  if (/^keys\/message\/[0-9a-f-]{36}$/iu.test(path) && method === 'GET') return true;
  if (/^sync\/[A-Za-z0-9._-]{1,128}$/u.test(path) && ['GET', 'PUT'].includes(method)) return true;
  return false;
}

async function forward(
  request: NextRequest,
  context: { params: Promise<{ segments: string[] }> },
) {
  const { segments } = await context.params;
  const path = segments.join('/');
  if (!isAllowedRoute(path, request.method)) {
    return NextResponse.json({ error: 'This API route or method is not available through the frontend.' }, { status: 404 });
  }
  const body = ['POST', 'PUT'].includes(request.method) ? await request.text() : undefined;
  return forwardApiRequest(request, `/${path}${request.nextUrl.search}`, request.method, body);
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
