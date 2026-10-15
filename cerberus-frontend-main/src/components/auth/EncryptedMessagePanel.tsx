'use client';

import { useState } from 'react';
import {
  decryptForEmployee,
  fetchEncryptedMessage,
  getRecipientMessageKeys,
  sendEncryptedMessage,
} from '@/lib/crypto/message-keys';

interface EncryptedMessagePanelProps {
  sessionToken: string;
  userId: string;
  sessionUserId: string;
  messageKeyId: string;
}

export function EncryptedMessagePanel({
  sessionToken,
  userId,
  sessionUserId,
  messageKeyId,
}: EncryptedMessagePanelProps) {
  const [documentId, setDocumentId] = useState('test-message');
  const [plaintext, setPlaintext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function runRoundTrip(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      if (!/^[A-Za-z0-9_-]{1,128}$/u.test(documentId)) {
        throw new Error('Use a document ID containing 1-128 letters, numbers, underscores, or hyphens.');
      }
      if (!plaintext) throw new Error('Enter a short non-empty test message.');

      const keys = await getRecipientMessageKeys(window.location.origin, sessionToken, userId);
      const recipientKey = keys.find((key) => key.keyId === messageKeyId);
      if (!recipientKey) {
        throw new Error('The active device encryption key is not available. Re-authenticate to register it.');
      }

      await sendEncryptedMessage(
        window.location.origin,
        sessionToken,
        sessionUserId,
        documentId,
        new TextEncoder().encode(plaintext),
        recipientKey,
      );
      const envelope = await fetchEncryptedMessage(
        window.location.origin,
        sessionToken,
        documentId,
      );
      const decrypted = await decryptForEmployee(envelope, sessionUserId, documentId);
      try {
        const recovered = new TextDecoder('utf-8', { fatal: true }).decode(decrypted);
        if (recovered !== plaintext) throw new Error('Decrypted message did not match the submitted test message.');
        setResult('Encrypted upload, download, and local decryption succeeded. The API stored only the encrypted envelope.');
      } finally {
        decrypted.fill(0);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Encrypted-message test failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Encrypted message test</h3>
        <p className="mt-1 text-sm leading-5 text-slate-600">
          Test only with non-sensitive data. A non-extractable device key is registered after passkey sign-in;
          message content is encrypted in this browser before upload.
        </p>
      </div>
      <form onSubmit={(event) => void runRoundTrip(event)} className="space-y-3">
        <label className="block text-sm font-medium text-slate-700">
          Test document ID
          <input
            value={documentId}
            onChange={(event) => setDocumentId(event.target.value)}
            maxLength={128}
            required
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Non-sensitive test message
          <textarea
            value={plaintext}
            onChange={(event) => setPlaintext(event.target.value)}
            maxLength={16000}
            required
            rows={3}
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-800 disabled:opacity-50"
        >
          {busy ? 'Encrypting and testing...' : 'Encrypt, upload, and verify'}
        </button>
      </form>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      {result && <p role="status" className="text-sm text-emerald-700">{result}</p>}
    </section>
  );
}
