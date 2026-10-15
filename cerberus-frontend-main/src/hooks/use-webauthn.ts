'use client';

import { useState, useCallback } from 'react';
import { AttestationStatus, WebAuthnVerificationResponse } from '@/types/auth';
import { authenticatedFetch } from '@/lib/auth/entra';
import { registerDeviceEncryptionKey } from '@/lib/crypto/message-keys';

export interface UseWebAuthnReturn {
  isRegistering: boolean;
  isAuthenticating: boolean;
  attestation: AttestationStatus;
  sessionToken: string | null;
  userId: string | null;
  sessionUserId: string | null;
  messageKeyId: string | null;
  error: string | null;
  registerPasskey: (username?: string) => Promise<boolean>;
  authenticatePasskey: () => Promise<boolean>;
  simulateHardwareToken: (username?: string) => Promise<boolean>;
  resetRegistration: () => void;
}

const INITIAL_ATTESTATION: AttestationStatus = {
  isRegistered: false,
  isHardwareBound: false,
  algorithm: 'Unenrolled',
  credentialId: undefined,
  publicKeyDigest: undefined,
  userEmail: undefined,
  enrolledAt: undefined,
};

export function useWebAuthn(): UseWebAuthnReturn {
  const [isRegistering, setIsRegistering] = useState<boolean>(false);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);
  const [attestation, setAttestation] = useState<AttestationStatus>(INITIAL_ATTESTATION);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [messageKeyId, setMessageKeyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const registerPasskey = useCallback(async (username = 'security_officer@cerberus.corp'): Promise<boolean> => {
    setIsRegistering(true);
    setError(null);

    try {
      // 1. Fetch challenge options from BFF
      const optionsRes = await authenticatedFetch('/api/bff/employee/register-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userName: username }),
      });

      if (!optionsRes.ok) {
        throw new Error(`Failed to fetch registration options: ${optionsRes.status}`);
      }

      const options = await optionsRes.json();

      // 2. Dynamically import simplewebauthn/browser to maintain SSR safety
      const { startRegistration } = await import('@simplewebauthn/browser');
      const attResp = await startRegistration(options);

      // 3. Post attestation response to BFF verification endpoint
      const verifyRes = await authenticatedFetch('/api/bff/employee/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attResp),
      });

      if (!verifyRes.ok) {
        throw new Error(`Verification endpoint returned ${verifyRes.status}`);
      }

      const verifyData: WebAuthnVerificationResponse = await verifyRes.json();

      if (verifyData.verified) {
        setAttestation({
          isRegistered: true,
          isHardwareBound: false,
          algorithm: 'WebAuthn; authenticator storage not attested',
          credentialId: verifyData.credentialId ?? verifyData.deviceId,
          publicKeyDigest: undefined,
          userEmail: username,
          enrolledAt: new Date().toISOString(),
        });
        setIsRegistering(false);
        return true;
      } else {
        throw new Error('Credential attestation could not be verified by zero-trust enclave');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'WebAuthn registration failed';
      setError(msg);
      setIsRegistering(false);
      return false;
    }
  }, []);

  const simulateHardwareToken = useCallback(async (_username = 'security_officer@cerberus.corp'): Promise<boolean> => {
    setError(null);
    setError('Hardware-token simulation is disabled. Use a real enrolled authenticator to test passkeys.');
    return false;
  }, []);

  const authenticatePasskey = useCallback(async (): Promise<boolean> => {
    setIsAuthenticating(true);
    setError(null);
    try {
      const optionsResponse = await authenticatedFetch('/api/bff/employee/auth-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const optionsBody = await optionsResponse.json();
      if (!optionsResponse.ok) throw new Error(optionsBody.error || `Passkey challenge failed (${optionsResponse.status}).`);

      const { startAuthentication } = await import('@simplewebauthn/browser');
      const credential = await startAuthentication(optionsBody);
      const verifyResponse = await authenticatedFetch('/api/bff/employee/auth-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credential),
      });
      const result = await verifyResponse.json();
      if (!verifyResponse.ok) throw new Error(result.error || `Passkey authentication failed (${verifyResponse.status}).`);
      if (result.verified !== true || typeof result.token !== 'string') {
        throw new Error('The API did not return a verified employee session.');
      }
      if (typeof result.userId !== 'string' || typeof result.sessionUserId !== 'string') {
        throw new Error('The API did not return the employee identity for encrypted messaging.');
      }
      const messageKey = await registerDeviceEncryptionKey(window.location.origin, result.token);
      setSessionToken(result.token);
      setUserId(result.userId);
      setSessionUserId(result.sessionUserId);
      setMessageKeyId(messageKey.keyId);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Passkey authentication failed.');
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  }, []);

  const resetRegistration = useCallback(() => {
    setAttestation(INITIAL_ATTESTATION);
    setSessionToken(null);
    setUserId(null);
    setSessionUserId(null);
    setMessageKeyId(null);
    setError(null);
  }, []);

  return {
    isRegistering,
    isAuthenticating,
    attestation,
    sessionToken,
    userId,
    sessionUserId,
    messageKeyId,
    error,
    registerPasskey,
    authenticatePasskey,
    simulateHardwareToken,
    resetRegistration,
  };
}
