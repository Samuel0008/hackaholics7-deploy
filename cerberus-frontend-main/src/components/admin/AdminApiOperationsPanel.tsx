'use client';

import { useState } from 'react';
import { authenticatedFetch } from '@/lib/auth/entra';

interface DemoCompliance {
  status: 'compliant' | 'noncompliant' | 'unknown';
  source: string;
  authoritative: false;
  recordedAt?: string;
}

export function AdminApiOperationsPanel() {
  const [userId, setUserId] = useState('');
  const [quarantineUserId, setQuarantineUserId] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [caseReference, setCaseReference] = useState('');
  const [demoNote, setDemoNote] = useState('');
  const [complianceReason, setComplianceReason] = useState('');
  const [investigationReference, setInvestigationReference] = useState('');
  const [investigationSummary, setInvestigationSummary] = useState('');
  const [complianceStatus, setComplianceStatus] = useState<DemoCompliance['status']>('unknown');
  const [compliance, setCompliance] = useState<DemoCompliance | null>(null);
  const [canaryUrl, setCanaryUrl] = useState<string | null>(null);
  const [decryptedPayload, setDecryptedPayload] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function callApi(path: string, method: 'GET' | 'POST', body?: object): Promise<Record<string, unknown>> {
    const url = new URL(`/api/bff/bank/${path}`, window.location.origin);
    if (method === 'GET') {
      url.searchParams.set('userId', userId);
      url.searchParams.set('deviceId', deviceId);
    }
    const response = await authenticatedFetch(url, {
      method,
      ...(body ? {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      } : {}),
    });
    const result: unknown = await response.json();
    if (!response.ok) {
      const detail = result && typeof result === 'object' && 'error' in result
        ? String(result.error)
        : `Request failed (${response.status}).`;
      throw new Error(detail);
    }
    if (!result || typeof result !== 'object') throw new Error('The API returned an invalid response.');
    return result as Record<string, unknown>;
  }

  async function perform(operation: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await operation();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The operation failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="font-semibold text-slate-950">Security and compliance operations</h2>
        <p className="mt-1 text-sm leading-5 text-slate-600">
          Each operation is authorized by the API using the signed-in Entra role. Use synthetic test records only.
          Compliance decryption displays plaintext in this browser after the backend records the audited access.
        </p>
      </div>

      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Employee Entra object ID
          <input value={userId} onChange={(event) => setUserId(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2 font-mono text-xs text-slate-900" />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Enrolled device ID
          <input value={deviceId} onChange={(event) => setDeviceId(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2 font-mono text-xs text-slate-900" />
        </label>
      </div>

      <div className="grid gap-4 border-t border-slate-200 pt-4 lg:grid-cols-2">
        <article className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Canary and account containment</h3>
          <button
            type="button"
            disabled={busy}
            onClick={() => void perform(async () => {
              setCanaryUrl(null);
              const result = await callApi('security/canaries', 'POST', {});
              if (typeof result.canaryUrl !== 'string') throw new Error('The API did not return the canary URL.');
              setCanaryUrl(result.canaryUrl);
              setMessage('A one-time canary URL was created. Treat it as a secret; access will be recorded.');
            })}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            Create 24-hour canary URL
          </button>
          {canaryUrl && <p className="break-all rounded-md bg-amber-50 p-2 font-mono text-xs text-amber-900">{canaryUrl}</p>}
          <label className="block text-sm font-medium text-slate-700">
            Tenant-scoped user ID from the alert
            <input value={quarantineUserId} onChange={(event) => setQuarantineUserId(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2 font-mono text-xs text-slate-900" />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Investigation reference
            <input value={investigationReference} onChange={(event) => setInvestigationReference(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2 text-slate-900" />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Investigation summary (20-2000 chars)
            <textarea value={investigationSummary} onChange={(event) => setInvestigationSummary(event.target.value)} minLength={20} maxLength={2000} rows={2} className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2 text-slate-900" />
          </label>
          <button
            type="button"
            disabled={busy || !quarantineUserId || !investigationReference || investigationSummary.trim().length < 20}
            onClick={() => void perform(async () => {
              await callApi('security/quarantine/release', 'POST', {
                userId: quarantineUserId,
                investigationReference,
                investigationSummary,
              });
              setMessage('Quarantine release recorded with the investigation details.');
            })}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            Release investigated account
          </button>
          <p className="text-xs text-slate-500">Release requires a tenant-scoped user ID copied from a security alert.</p>
        </article>

        <article className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Device registry operations</h3>
          <button
            type="button"
            disabled={busy || !userId || !deviceId}
            onClick={() => void perform(async () => {
              const result = await callApi('security/devices/compliance/demo', 'GET');
              setCompliance(result.compliance as DemoCompliance);
              setMessage('Loaded administrator-entered demo compliance status; it is not authoritative MDM posture.');
            })}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            Read demo compliance status
          </button>
          {compliance && (
            <p className="text-sm text-slate-600">
              {compliance.status} · {compliance.source} · authoritative: no
              {compliance.recordedAt ? ` · ${new Date(compliance.recordedAt).toLocaleString()}` : ''}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <select
              value={complianceStatus}
              onChange={(event) => setComplianceStatus(event.target.value as DemoCompliance['status'])}
              aria-label="Demo device compliance status"
              className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-800"
            >
              <option value="unknown">Unknown</option>
              <option value="compliant">Compliant (demo)</option>
              <option value="noncompliant">Noncompliant (demo)</option>
            </select>
            <button
              type="button"
              disabled={busy || !userId || !deviceId || demoNote.trim().length < 20}
              onClick={() => void perform(async () => {
                await callApi('security/devices/compliance/demo', 'POST', {
                  userId,
                  deviceId,
                  status: complianceStatus,
                  note: demoNote,
                });
                setMessage('Demo compliance status recorded. It does not represent a real MDM check.');
              })}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
            >
              Save demo status
            </button>
          </div>
          <label className="block text-sm font-medium text-slate-700">
            Reason / note (20-500 chars)
            <textarea value={demoNote} onChange={(event) => setDemoNote(event.target.value)} minLength={20} maxLength={500} rows={2} className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2 text-slate-900" />
          </label>
          <button
            type="button"
            disabled={busy || !userId || !deviceId}
            onClick={() => {
              if (!window.confirm('Revoke this enrolled device and its passkeys for API access? This does not send a physical device command.')) return;
              void perform(async () => {
                await callApi('security/devices/revoke', 'POST', { userId, deviceId });
                setMessage('Device and associated passkeys revoked for API access. No physical command was sent.');
              });
            }}
            className="rounded-md border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 disabled:opacity-50"
          >
            Revoke device API access
          </button>
        </article>
      </div>

      <article className="space-y-3 border-t border-slate-200 pt-4">
        <h3 className="text-sm font-semibold text-slate-900">Audited compliance decryption</h3>
        <p className="text-sm text-amber-800">
          Requires the Bank.Compliance role. The plaintext is returned only after audit recording; handle any result as sensitive.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Encrypted document ID
            <input value={documentId} onChange={(event) => setDocumentId(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2 font-mono text-xs text-slate-900" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Case reference
            <input value={caseReference} onChange={(event) => setCaseReference(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2 text-slate-900" />
          </label>
        </div>
        <label className="block text-sm font-medium text-slate-700">
          Business reason (20-2000 chars)
          <textarea value={complianceReason} onChange={(event) => setComplianceReason(event.target.value)} minLength={20} maxLength={2000} rows={2} className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2 text-slate-900" />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !userId || !documentId || !caseReference || complianceReason.trim().length < 20}
            onClick={() => {
              setDecryptedPayload(null);
              void perform(async () => {
                const result = await callApi('security/compliance/decrypt', 'POST', {
                  userId,
                  documentId,
                  caseReference,
                  reason: complianceReason,
                });
                if (typeof result.plaintextBase64Url !== 'string') {
                  throw new Error('The API did not return the audited plaintext payload.');
                }
                setDecryptedPayload(result.plaintextBase64Url);
                setMessage('Compliance decrypt completed and the backend recorded its audit event.');
              });
            }}
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Decrypt with compliance escrow
          </button>
          {decryptedPayload && (
            <button type="button" onClick={() => setDecryptedPayload(null)} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700">
              Clear decrypted output
            </button>
          )}
        </div>
        {decryptedPayload && (
          <label className="block text-sm font-medium text-rose-800">
            Sensitive plaintext (base64url)
            <textarea readOnly value={decryptedPayload} rows={4} className="mt-1 w-full rounded-md border border-rose-300 bg-rose-50 p-2 font-mono text-xs text-rose-900" />
          </label>
        )}
      </article>
    </section>
  );
}
