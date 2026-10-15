import { NextRequest, NextResponse } from 'next/server';
import { forwardApiRequest } from '@/lib/bff/upstream';

export async function POST(request: NextRequest) {
  let credential: unknown;
  try {
    credential = await request.json();
  } catch {
    return NextResponse.json({ error: 'A valid WebAuthn credential is required.' }, { status: 400 });
  }
  return forwardApiRequest(
    request,
    '/passkeys/register/verify',
    'POST',
    JSON.stringify({ response: credential }),
  );
}
