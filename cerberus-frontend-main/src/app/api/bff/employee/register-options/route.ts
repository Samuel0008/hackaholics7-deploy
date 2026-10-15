import { NextRequest } from 'next/server';
import { forwardApiRequest } from '@/lib/bff/upstream';

export async function POST(request: NextRequest) {
  const body = await request.text();
  return forwardApiRequest(request, '/passkeys/register/options', 'POST', body);
}
