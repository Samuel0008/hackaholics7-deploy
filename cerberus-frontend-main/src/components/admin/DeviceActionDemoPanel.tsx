'use client';

import { useCallback, useEffect, useState } from 'react';
import { authenticatedFetch } from '@/lib/auth/entra';

interface DeviceAction {
  actionId: string;
  userId: string;
  deviceId: string;
  action: 'lock' | 'wipe';
  status: string;
  requestedBy: string;
}

export function DeviceActionDemoPanel() {
  const [userId, setUserId] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [reason, setReason] = useState('');
  const [actions, setActions] = useState<DeviceAction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const response = await authenticatedFetch('/api/bff/bank/security/devices/actions');
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `Action list failed (${response.status}).`);
      setActions(Array.isArray(body.actions) ? body.actions as DeviceAction[] : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load demo device-action requests.');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function requestAction(action: 'lock' | 'wipe') {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await authenticatedFetch('/api/bff/bank/security/devices/actions/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, deviceId, action, reason }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `Action request failed (${response.status}).`);
      setMessage(`Simulation request ${body.actionId} is pending. No device command was sent.`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create the demo action request.');
    } finally {
      setBusy(false);
    }
  }

  async function decide(actionId: string, decision: 'approve' | 'reject') {
    const decisionReason = window.prompt(`Reason to ${decision} this simulation request (20-500 characters):`);
    if (!decisionReason) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await authenticatedFetch('/api/bff/bank/security/devices/actions/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId, decision, reason: decisionReason }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `Decision failed (${response.status}).`);
      setMessage(`Decision recorded (${body.status}). No device command was sent.`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to record the simulation decision.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
      <div>
        <h2 className="font-semibold text-slate-950">Device action simulation</h2>
        <p className="mt-1 text-sm text-amber-800">Simulation records only. No MDM connection or device command is implemented.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <input aria-label="Employee Entra object ID" value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="Employee Entra object ID" className="rounded-md border border-slate-300 bg-white p-2 text-sm text-slate-900" />
        <input aria-label="Device ID" value={deviceId} onChange={(event) => setDeviceId(event.target.value)} placeholder="Enrolled device ID" className="rounded-md border border-slate-300 bg-white p-2 text-sm text-slate-900" />
        <input aria-label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Simulation reason (20-500 chars)" className="rounded-md border border-slate-300 bg-white p-2 text-sm text-slate-900" />
      </div>
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => void requestAction('lock')} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-50">Request simulated lock</button>
        <button disabled={busy} onClick={() => void requestAction('wipe')} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-50">Request simulated wipe</button>
        <button disabled={busy} onClick={() => void refresh()} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-50">Refresh requests</button>
      </div>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
      <div className="divide-y divide-slate-100">
        {actions.map((action) => (
          <article key={action.actionId} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
            <div className="text-slate-700">{action.action} · {action.status} · {action.deviceId}</div>
            {action.status === 'pending-approval' && (
              <div className="flex gap-2">
                <button disabled={busy} onClick={() => void decide(action.actionId, 'approve')} className="text-emerald-700 disabled:opacity-50">Approve demo</button>
                <button disabled={busy} onClick={() => void decide(action.actionId, 'reject')} className="text-rose-700 disabled:opacity-50">Reject demo</button>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
