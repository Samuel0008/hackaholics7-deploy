import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as postRegisterOptions } from '@/app/api/bff/employee/register-options/route';
import { POST as postRegisterVerify } from '@/app/api/bff/employee/register-verify/route';
import { GET as getSyncPayload } from '@/app/api/bff/employee/sync-payload/route';
import { GET as getTelemetryStream } from '@/app/api/bff/soc/telemetry-stream/route';
import { POST as postQuarantine } from '@/app/api/bff/soc/quarantine/route';
import { GET as getTriadStatus } from '@/app/api/bff/audit/triad-status/route';
import { GET as getAmlInspect } from '@/app/api/bff/audit/aml-inspect/route';
import { GET as getBankApiRoute } from '@/app/api/bff/bank/[...segments]/route';

const authorization = 'Bearer test-entra-token';

function stubApi(status: number, body: unknown) {
  const mockFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', mockFetch);
  return mockFetch;
}

afterEach(() => vi.unstubAllGlobals());

describe('BFF routes proxy the Functions API without fake success fallbacks', () => {
  it('maps passkey registration options to the Functions POST contract', async () => {
    const mockFetch = stubApi(200, {
      challenge: 'server-challenge',
      user: { name: 'alice@example.test' },
    });
    const request = new NextRequest('http://localhost:3000/api/bff/employee/register-options', {
      method: 'POST',
      headers: { authorization, 'content-type': 'application/json' },
      body: JSON.stringify({ userName: 'alice@example.test' }),
    });
    const response = await postRegisterOptions(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ challenge: 'server-challenge' });
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(String(url)).toBe('http://localhost:7071/api/passkeys/register/options');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('authorization')).toBe(authorization);
    expect(JSON.parse(String(init?.body))).toEqual({ userName: 'alice@example.test' });
  });

  it('wraps a WebAuthn credential in the Functions verification request shape', async () => {
    const mockFetch = stubApi(201, { verified: true, deviceId: 'device-1' });
    const credential = { id: 'credential-1', type: 'public-key' };
    const response = await postRegisterVerify(new NextRequest('http://localhost:3000/api/bff/employee/register-verify', {
      method: 'POST',
      headers: { authorization, 'content-type': 'application/json' },
      body: JSON.stringify(credential),
    }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ verified: true, deviceId: 'device-1' });
    const [, init] = mockFetch.mock.calls[0]!;
    expect(JSON.parse(String(init?.body))).toEqual({ response: credential });
  });

  it('forwards tenant decoy telemetry and preserves real backend responses', async () => {
    const payload = {
      source: 'tenant-decoy-alerts',
      summary: { totalAlerts: 1, identifiedAlerts: 1, containmentActions: 1 },
      alerts: [{ type: 'identified-decoy-access' }],
    };
    const mockFetch = stubApi(200, payload);
    const request = new NextRequest('http://localhost:3000/api/bff/soc/telemetry-stream', {
      headers: { authorization },
    });
    const response = await getTelemetryStream(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(payload);
    expect(String(mockFetch.mock.calls[0]![0])).toBe('http://localhost:7071/api/security/dashboard/telemetry');
  });

  it('keeps authorization and upstream errors visible to the caller', async () => {
    const mockFetch = stubApi(403, { error: 'Missing Bank.SecurityAdmin role.' });
    const request = new NextRequest('http://localhost:3000/api/bff/soc/telemetry-stream', {
      headers: { authorization },
    });
    const response = await getTelemetryStream(request);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Missing Bank.SecurityAdmin role.' });
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('requires an Entra bearer token and does not call the upstream without one', async () => {
    const mockFetch = stubApi(200, {});
    const response = await getTelemetryStream(new NextRequest('http://localhost:3000/api/bff/soc/telemetry-stream'));
    expect(response.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns explicit not-implemented responses for unavailable features', async () => {
    const sync = await getSyncPayload();
    const quarantine = await postQuarantine(new NextRequest('http://localhost:3000/api/bff/soc/quarantine', { method: 'POST' }));
    expect(sync.status).toBe(501);
    expect(quarantine.status).toBe(501);
    expect((await quarantine.json()).error).toContain('No firewall');
  });

  it('routes key registry and escrow audit to their actual Functions APIs', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ keys: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ entries: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const request = new NextRequest('http://localhost:3000/api/bff/audit/triad-status', {
      headers: { authorization },
    });
    const [registry, audit] = await Promise.all([getTriadStatus(request), getAmlInspect(request)]);
    expect(registry.status).toBe(200);
    expect(audit.status).toBe(200);
    expect(String(fetchMock.mock.calls[0]![0])).toBe('http://localhost:7071/api/security/crypto/registry');
    expect(String(fetchMock.mock.calls[1]![0])).toBe('http://localhost:7071/api/security/compliance/audit');
  });

  it('allows only the documented API route/method pairs through the shared BFF', async () => {
    const mockFetch = stubApi(200, { alerts: [] });
    const request = new NextRequest('http://localhost:3000/api/bff/bank/security/alerts', {
      headers: { authorization },
    });
    const response = await getBankApiRoute(request, { params: Promise.resolve({ segments: ['security', 'alerts'] }) });
    expect(response.status).toBe(200);
    expect(String(mockFetch.mock.calls[0]![0])).toBe('http://localhost:7071/api/security/alerts');

    const rejected = await getBankApiRoute(request, { params: Promise.resolve({ segments: ['security', 'unknown'] }) });
    expect(rejected.status).toBe(404);

    const reservedAdminPath = await getBankApiRoute(request, {
      params: Promise.resolve({ segments: ['admin', 'alerts'] }),
    });
    expect(reservedAdminPath.status).toBe(404);
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('preserves validated query parameters for allowlisted API routes', async () => {
    const mockFetch = stubApi(200, { compliance: { status: 'unknown', authoritative: false } });
    const userId = '123e4567-e89b-42d3-a456-426614174000';
    const request = new NextRequest(
      `http://localhost:3000/api/bff/bank/security/devices/compliance/demo?userId=${userId}&deviceId=device-1`,
      { headers: { authorization } },
    );
    const response = await getBankApiRoute(request, {
      params: Promise.resolve({ segments: ['security', 'devices', 'compliance', 'demo'] }),
    });
    expect(response.status).toBe(200);
    expect(String(mockFetch.mock.calls[0]![0])).toBe(
      `http://localhost:7071/api/security/devices/compliance/demo?userId=${userId}&deviceId=device-1`,
    );
  });

  it('keeps the frontend process health endpoint separate from API health', async () => {
    const { GET: getHealth } = await import('@/app/api/health/route');
    const response = await getHealth();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'healthy', service: 'cerberus-frontend' });
  });
});
