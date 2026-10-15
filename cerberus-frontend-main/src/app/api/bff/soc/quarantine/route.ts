import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: 'Network/IP quarantine is not implemented. No firewall or network action was taken.' },
    { status: 501 },
  );
}
