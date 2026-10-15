import { NextRequest } from 'next/server';
import { forwardApiRequest } from '@/lib/bff/upstream';

export async function GET(request: NextRequest) {
  return forwardApiRequest(request, '/security/crypto/registry', 'GET');
}
