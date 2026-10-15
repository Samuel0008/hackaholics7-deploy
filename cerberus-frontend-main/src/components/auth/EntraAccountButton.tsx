'use client';

import { useEffect, useRef, useState } from 'react';
import { LogIn, LogOut } from 'lucide-react';
import {
  getSignedInAccount,
  signIn,
  signOut,
} from '@/lib/auth/entra';

export function EntraAccountButton() {
  const [accountName, setAccountName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const interactionInProgress = useRef(false);

  useEffect(() => {
    getSignedInAccount()
      .then((account) => setAccountName(account?.username ?? null))
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'Entra configuration is invalid.');
      });
  }, []);

  async function handleClick() {
    if (interactionInProgress.current) return;
    interactionInProgress.current = true;
    setBusy(true);
    setError(null);
    try {
      if (accountName) {
        await signOut();
        setAccountName(null);
      } else {
        await signIn();
      }
    } catch (reason) {
      if (
        reason instanceof Error
        && 'errorCode' in reason
        && reason.errorCode === 'interaction_in_progress'
      ) {
        setError('A Microsoft sign-in is already in progress. Close any open sign-in window, refresh this page, and try again.');
      } else {
        setError(reason instanceof Error ? reason.message : 'Entra authentication failed.');
      }
    } finally {
      interactionInProgress.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="inline-flex max-w-52 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
      >
        {accountName ? <LogOut className="h-3.5 w-3.5" /> : <LogIn className="h-3.5 w-3.5" />}
        <span>{busy ? 'Please wait…' : accountName || 'Sign in with Entra'}</span>
      </button>
      {error && <span role="alert" className="max-w-56 text-right text-[11px] text-rose-700">{error}</span>}
    </div>
  );
}
