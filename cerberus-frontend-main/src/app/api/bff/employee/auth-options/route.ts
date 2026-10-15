import { NextRequest } from 'next/server';
import { forwardApiRequest } from '@/lib/bff/upstream';

export async function POST(request: NextRequest) {
  return forwardApiRequest(request, '/passkeys/auth/options', 'POST', '{}');
}
