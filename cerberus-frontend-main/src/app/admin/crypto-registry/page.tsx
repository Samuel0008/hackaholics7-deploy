'use client';

import { useCallback, useEffect, useState } from 'react';
import { KeyRound, RefreshCw, ShieldAlert } from 'lucide-react';
import { authenticatedFetch } from '@/lib/auth/entra';
import { DeviceActionDemoPanel } from '@/components/admin/DeviceActionDemoPanel';

interface RegistryData {
  storageProvider: string;
  keys: Array<{ purpose: string; keyId: string; algorithm: string; keyType: string }>;
  unsupportedClaims: string[];
}

interface AuditEntry {
  occurredAt: string;
  documentId: string;
  actorId?: string;
  caseReference?: string;
  reason?: string;
}

interface AuditPublicKey {
  publicKey: { keyId: string; algorithm: string; kty: string };
}

export default function CryptoRegistryPage() {
  const [registry, setRegistry] = useState<RegistryData | null>(null);
  const [auditSigningKey, setAuditSigningKey] = useState<AuditPublicKey['publicKey'] | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [registryResponse, auditResponse, signingKeyResponse] = await Promise.all([
        authenticatedFetch('/api/bff/bank/security/crypto/registry'),
        authenticatedFetch('/api/bff/bank/security/compliance/audit'),
        authenticatedFetch('/api/bff/bank/security/audit/public-key'),
      ]);
      const [registryBody, auditBody, signingKeyBody] = await Promise.all([
        registryResponse.json(),
        auditResponse.json(),
        signingKeyResponse.json(),
      ]);
      if (!registryResponse.ok) throw new Error(registryBody.error || `Crypto registry failed (${registryResponse.status}).`);
      if (!auditResponse.ok) throw new Error(auditBody.error || `Compliance audit failed (${auditResponse.status}).`);
      if (!signingKeyResponse.ok) throw new Error(signingKeyBody.error || `Audit signing key failed (${signingKeyResponse.status}).`);
      setRegistry(registryBody as RegistryData);
      setAudit(Array.isArray(auditBody.entries) ? auditBody.entries as AuditEntry[] : []);
      setAuditSigningKey(signingKeyBody.publicKey as AuditPublicKey['publicKey']);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load tenant key metadata.');
      setRegistry(null);
      setAuditSigningKey(null);
      setAudit([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="mx-auto max-w-6xl space-y-8 px-5 py-10 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <header>
            <p className="text-sm font-medium text-blue-700">Security administration</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Key registry</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Configured backend key metadata and recorded compliance-decryption audits.</p>
          </header>
          <button onClick={() => void refresh()} disabled={loading} className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50">
            <RefreshCw className="h-4 w-4" /> {loading ? 'Refreshing' : 'Refresh'}
          </button>
        </div>

        {error && <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
        {!registry && loading && <p role="status" className="text-sm text-slate-500">Loading key registry…</p>}

        {registry && (
          <>
            <section className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-950"><KeyRound className="h-4 w-4 text-slate-600" /> Tenant key metadata</div>
              <p className="mt-2 text-sm text-slate-600">Storage provider: {registry.storageProvider}. Metadata appears when the backend can read the configured public keys.</p>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {registry.keys.map((key) => (
                  <article key={key.keyId} className="rounded-md border border-slate-200 p-4">
                    <h2 className="text-sm font-semibold text-slate-900">{key.purpose}</h2>
                    <dl className="mt-3 space-y-2 break-all text-sm">
                      <div><dt className="inline text-slate-500">Key ID: </dt><dd className="inline text-slate-700">{key.keyId}</dd></div>
                      <div><dt className="inline text-slate-500">Algorithm: </dt><dd className="inline text-slate-700">{key.algorithm}</dd></div>
                      <div><dt className="inline text-slate-500">Key type: </dt><dd className="inline text-slate-700">{key.keyType}</dd></div>
                    </dl>
                  </article>
                ))}
              </div>
            </section>

            {auditSigningKey && (
              <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm">
                <h2 className="font-semibold text-slate-950">Audit verification key</h2>
                <p className="mt-2 break-all font-mono text-xs text-slate-700">{auditSigningKey.keyId}</p>
                <p className="mt-2 text-sm text-slate-500">{auditSigningKey.algorithm} · {auditSigningKey.kty}. Verify the key through a trusted out-of-band channel before relying on signatures.</p>
              </section>
            )}

            <section className="rounded-lg border border-amber-200 bg-amber-50 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-950"><ShieldAlert className="h-4 w-4" /> Capability limitations</div>
              <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-amber-900">
                {registry.unsupportedClaims.map((claim) => <li key={claim}>{claim}</li>)}
              </ul>
              <p className="mt-3 text-sm text-amber-900">AML/OFAC screening is not integrated. Escrow decryption is an explicit compliance operation, not transaction screening.</p>
            </section>

            <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <h2 className="border-b border-slate-200 px-5 py-4 text-sm font-semibold text-slate-950">Compliance decryption audit · last 30 days</h2>
              {audit.length === 0 ? <p className="p-6 text-sm text-slate-500">No successful escrow decryptions are recorded.</p> : (
                <div className="divide-y divide-slate-100">
                  {audit.map((entry, index) => (
                    <article key={`${entry.documentId}-${entry.occurredAt}-${index}`} className="grid gap-2 px-5 py-4 text-sm sm:grid-cols-2">
                      <div><span className="text-slate-500">Case: </span><span className="text-slate-800">{entry.caseReference || 'legacy record'}</span></div>
                      <div><span className="text-slate-500">When: </span><span className="text-slate-700">{new Date(entry.occurredAt).toLocaleString()}</span></div>
                      <div><span className="text-slate-500">Document: </span><span className="break-all text-slate-700">{entry.documentId}</span></div>
                      {entry.actorId && <div><span className="text-slate-500">Actor: </span><span className="break-all font-mono text-xs text-slate-700">{entry.actorId}</span></div>}
                    </article>
                  ))}
                </div>
              )}
            </section>
            <details className="rounded-lg border border-slate-200 bg-white">
              <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-slate-900 marker:hidden">
                Device action simulation
                <span className="ml-2 font-normal text-slate-500">No MDM command is sent</span>
              </summary>
              <div className="border-t border-slate-200 p-4 sm:p-5">
                <DeviceActionDemoPanel />
              </div>
            </details>
          </>
        )}
      </div>
    </div>
  );
}
