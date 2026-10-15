import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    { error: 'The banking API does not provide an automated decoy sync payload.' },
    { status: 501 },
  );
}
