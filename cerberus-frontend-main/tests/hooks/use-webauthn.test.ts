import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useWebAuthn } from '@/hooks/use-webauthn';

const { authenticatedFetch, startRegistration, startAuthentication, registerDeviceEncryptionKey } = vi.hoisted(() => ({
  authenticatedFetch: vi.fn(),
  startRegistration: vi.fn(),
  startAuthentication: vi.fn(),
  registerDeviceEncryptionKey: vi.fn(),
}));

vi.mock('@/lib/auth/entra', () => ({ authenticatedFetch }));
vi.mock('@simplewebauthn/browser', () => ({ startRegistration, startAuthentication }));
vi.mock('@/lib/crypto/message-keys', () => ({ registerDeviceEncryptionKey }));

describe('useWebAuthn', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    registerDeviceEncryptionKey.mockResolvedValue({ keyId: 'message-key-1' });
  });

  it('starts unenrolled and without an API session', () => {
    const { result } = renderHook(() => useWebAuthn());
    expect(result.current.attestation.isRegistered).toBe(false);
    expect(result.current.attestation.isHardwareBound).toBe(false);
    expect(result.current.sessionToken).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('sends real passkey registration to the Functions route and does not claim hardware attestation', async () => {
    authenticatedFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ challenge: 'server', user: { name: 'person@example.test' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ verified: true, deviceId: 'device-1' }), { status: 201 }));
    startRegistration.mockResolvedValue({ id: 'credential-1', type: 'public-key' });

    const { result } = renderHook(() => useWebAuthn());
    let succeeded = false;
    await act(async () => {
      succeeded = await result.current.registerPasskey('person@example.test');
    });

    expect(succeeded).toBe(true);
    expect(authenticatedFetch).toHaveBeenCalledTimes(2);
    expect(authenticatedFetch.mock.calls[0]![0]).toBe('/api/bff/employee/register-options');
    expect(authenticatedFetch.mock.calls[1]![0]).toBe('/api/bff/employee/register-verify');
    expect(result.current.attestation.isRegistered).toBe(true);
    expect(result.current.attestation.isHardwareBound).toBe(false);
    expect(result.current.attestation.credentialId).toBe('device-1');
  });

  it('rejects fabricated hardware-token enrollment instead of reporting success', async () => {
    const { result } = renderHook(() => useWebAuthn());
    let succeeded = true;
    await act(async () => {
      succeeded = await result.current.simulateHardwareToken();
    });
    expect(succeeded).toBe(false);
    expect(result.current.attestation.isRegistered).toBe(false);
    expect(result.current.error).toContain('simulation is disabled');
    expect(authenticatedFetch).not.toHaveBeenCalled();
  });

  it('creates a short-lived employee API session after passkey authentication', async () => {
    authenticatedFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ challenge: 'server' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        verified: true,
        token: 'session-token',
        userId: 'employee-oid',
        sessionUserId: 'tenant-scoped-user',
      }), { status: 200 }));
    startAuthentication.mockResolvedValue({ id: 'credential-1', type: 'public-key' });
    const { result } = renderHook(() => useWebAuthn());

    let succeeded = false;
    await act(async () => {
      succeeded = await result.current.authenticatePasskey();
    });
    expect(succeeded).toBe(true);
    expect(result.current.sessionToken).toBe('session-token');
    expect(result.current.userId).toBe('employee-oid');
    expect(result.current.sessionUserId).toBe('tenant-scoped-user');
    expect(result.current.messageKeyId).toBe('message-key-1');
    expect(registerDeviceEncryptionKey).toHaveBeenCalledWith(window.location.origin, 'session-token');
    expect(authenticatedFetch.mock.calls.map(([url]) => url)).toEqual([
      '/api/bff/employee/auth-options',
      '/api/bff/employee/auth-verify',
    ]);
  });

  it('clears local session state when enrollment is reset', async () => {
    authenticatedFetch
      .mockResolvedValueOnce(new Response(JSON.stringify({ challenge: 'server', user: { name: 'person@example.test' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ verified: true, deviceId: 'device-1' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ challenge: 'server' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        verified: true,
        token: 'session-token',
        userId: 'employee-oid',
        sessionUserId: 'tenant-scoped-user',
      }), { status: 200 }));
    startRegistration.mockResolvedValue({ id: 'credential-1', type: 'public-key' });
    startAuthentication.mockResolvedValue({ id: 'credential-1', type: 'public-key' });
    const { result } = renderHook(() => useWebAuthn());

    await act(async () => {
      await result.current.registerPasskey('person@example.test');
      await result.current.authenticatePasskey();
    });
    expect(result.current.sessionToken).toBe('session-token');
    act(() => result.current.resetRegistration());
    expect(result.current.attestation.isRegistered).toBe(false);
    expect(result.current.sessionToken).toBeNull();
  });
});
