'use client';

import React, { useState } from 'react';
import { KeyRound, Check, RotateCcw, AlertTriangle } from 'lucide-react';
import { useWebAuthn } from '@/hooks/use-webauthn';
import { AttestationBadge } from './AttestationBadge';
import { EncryptedMessagePanel } from './EncryptedMessagePanel';

export const WebAuthnEnrollmentCard: React.FC = () => {
  const [email, setEmail] = useState('');
  const {
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
    resetRegistration,
  } = useWebAuthn();

  const handleEnrollPasskey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    await registerPasskey(email);
  };

  return (
    <div className="space-y-6 rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-950">
            Passkey enrollment
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Uses the signed-in Entra identity; authenticator hardware backing is not attested
          </p>
        </div>

        <AttestationBadge
          isHardwareBound={attestation.isHardwareBound}
          algorithm={attestation.algorithm}
        />
      </div>

      {attestation.isRegistered ? (
        <div className="space-y-4">
          {error && <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
          <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
            <div className="flex items-center gap-2">
              <Check className="h-5 w-5 shrink-0 text-emerald-700" />
              <span className="text-sm font-semibold">
                Passkey registration verified by the API
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 border-t border-emerald-200 pt-3 text-xs text-slate-700 sm:grid-cols-2">
              <div>
                <span className="text-slate-500">Enrolled identity:</span> {attestation.userEmail}
              </div>
              <div>
                <span className="text-slate-500">Authenticator:</span> {attestation.algorithm}
              </div>
              <div className="truncate">
                <span className="text-slate-500">Credential ID:</span> {attestation.credentialId}
              </div>
              <div>
                <span className="text-slate-500">Enrolled at:</span>{' '}
                {attestation.enrolledAt ? new Date(attestation.enrolledAt).toLocaleTimeString() : 'Just now'}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">
              {sessionToken
                ? 'Passkey verified; a short-lived API session is active in memory.'
                : 'Registering does not sign you in. Verify the passkey to create a 15-minute API session.'}
            </p>
            <button
              type="button"
              onClick={() => void authenticatePasskey()}
              disabled={isAuthenticating}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
            >
              <KeyRound className="h-4 w-4" />
              {isAuthenticating ? 'Verifying...' : sessionToken ? 'Re-authenticate passkey' : 'Sign in with passkey'}
            </button>
          </div>

          {sessionToken && userId && sessionUserId && messageKeyId && (
            <EncryptedMessagePanel
              sessionToken={sessionToken}
              userId={userId}
              sessionUserId={sessionUserId}
              messageKeyId={messageKeyId}
            />
          )}

          <div className="flex justify-end">
            <button
              onClick={resetRegistration}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Enrollment</span>
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleEnrollPasskey} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Passkey display name
            </label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              placeholder="Your name or work email"
              required
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={isRegistering}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
            >
              <KeyRound className="w-4 h-4" />
              <span>{isRegistering ? 'Registering passkey...' : 'Register a real passkey'}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
