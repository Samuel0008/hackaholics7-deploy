'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { authenticatedFetch } from '@/lib/auth/entra';
import { AdminApiOperationsPanel } from '@/components/admin/AdminApiOperationsPanel';

interface SecurityAlert {
  type: string;
  canaryId: string;
  occurredAt: string;
  severity?: string;
  action?: string;
  userId?: string;
  eventId?: string;
}

interface DashboardData {
  source: string;
  generatedAt: string;
  capabilities: {
    decoyAlertHistory: boolean;
    sourceIpAttribution: boolean;
    networkFingerprinting: boolean;
    networkQuarantine: boolean;
  };
  summary: {
    totalAlerts: number;
    identifiedAlerts: number;
    containmentActions: number;
  };
  alerts: SecurityAlert[];
}

export default function SocDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authenticatedFetch('/api/bff/bank/security/dashboard/telemetry');
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`);
      setData(body as DashboardData);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load tenant security alerts.');
      setData(null);
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
            <p className="text-sm font-medium text-blue-700">Security operations</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Security alerts</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Tenant-scoped decoy and containment records from the connected API.</p>
          </header>
          <button onClick={() => void refresh()} disabled={loading} className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50">
            <RefreshCw className="h-4 w-4" /> {loading ? 'Refreshing' : 'Refresh'}
          </button>
        </div>

        {error && <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}
        {!data && loading && <p role="status" className="text-sm text-slate-500">Loading tenant alerts…</p>}

        {data && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                ['Recorded decoy alerts', data.summary.totalAlerts],
                ['Alerts linked to identity', data.summary.identifiedAlerts],
                ['Recorded containment actions', data.summary.containmentActions],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-slate-200 bg-white p-5">
                  <div className="text-sm text-slate-600">{label}</div>
                  <div className="mt-2 text-3xl font-semibold tabular-nums text-slate-950">{value}</div>
                </div>
              ))}
            </div>

            <section className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <div>
                <h2 className="text-sm font-semibold text-amber-950">Coverage limitation</h2>
                <p className="mt-1 text-sm leading-5 text-amber-900">IP attribution, network fingerprinting, general threat scoring, and network quarantine are not connected. Identified decoy interaction can trigger account/session responses only.</p>
              </div>
            </section>

            <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="text-sm font-semibold text-slate-950">Recent alerts</h2>
              </div>
              {data.alerts.length === 0 ? <p className="p-6 text-sm text-slate-500">No alerts are recorded for this tenant.</p> : (
                <div className="divide-y divide-slate-100">
                  {data.alerts.map((alert, index) => (
                    <article key={alert.eventId || `${alert.type}-${alert.occurredAt}-${index}`} className="grid gap-3 px-5 py-4 text-sm sm:grid-cols-[1fr_1.2fr_1fr]">
                      <div><div className="text-xs text-slate-500">Event</div><div className="mt-1 font-medium text-slate-900">{alert.type}</div></div>
                      <div><div className="text-xs text-slate-500">Record</div><div className="mt-1 break-all text-slate-700">{alert.canaryId}</div></div>
                      <div><div className="text-xs text-slate-500">Recorded</div><div className="mt-1 text-slate-700">{new Date(alert.occurredAt).toLocaleString()}</div></div>
                      {alert.action && <div><div className="text-xs text-slate-500">Action</div><div className="mt-1 text-slate-700">{alert.action}</div></div>}
                      {alert.severity && <div><div className="text-xs text-slate-500">Severity</div><div className="mt-1 text-slate-700">{alert.severity}</div></div>}
                      {alert.userId && <div><div className="text-xs text-slate-500">Tenant-scoped user</div><div className="mt-1 break-all font-mono text-xs text-slate-600">{alert.userId}</div></div>}
                    </article>
                  ))}
                </div>
              )}
            </section>
            <details className="rounded-lg border border-slate-200 bg-white">
              <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-slate-900 marker:hidden">
                Administrative actions
                <span className="ml-2 font-normal text-slate-500">Canary, account, device, and compliance</span>
              </summary>
              <div className="border-t border-slate-200 p-4 sm:p-5">
                <AdminApiOperationsPanel />
              </div>
            </details>
            <p className="text-xs text-slate-500">Source: {data.source} · Updated {new Date(data.generatedAt).toLocaleString()}</p>
          </>
        )}
      </div>
    </div>
  );
}
