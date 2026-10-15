import { createPublicKey, verify } from 'node:crypto';

export type AuditPayload = Record<string, string | number | boolean | null>;

export interface AuditPublicKey {
  keyId: string;
  algorithm: 'RS256';
  kty: 'RSA';
  n: string;
  e: string;
}

export function serializeAuditPayload(payload: AuditPayload): string {
  const ordered: AuditPayload = {};
  for (const key of Object.keys(payload).sort()) {
    ordered[key] = payload[key];
  }
  return JSON.stringify(ordered);
}

export function verifyAuditEvidence(
  payload: string,
  signature: string,
  publicKey: AuditPublicKey,
): boolean {
  try {
    const parsed: unknown = JSON.parse(payload);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
    const entries = Object.entries(parsed);
    if (entries.some(([, value]) =>
      value !== null &&
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'boolean'
    )) return false;
    if (serializeAuditPayload(parsed as AuditPayload) !== payload) return false;
    if (!/^[A-Za-z0-9_-]+$/u.test(signature)) return false;

    const key = createPublicKey({
      key: { kty: 'RSA', n: publicKey.n, e: publicKey.e },
      format: 'jwk',
    });
    return verify(
      'RSA-SHA256',
      Buffer.from(payload, 'utf8'),
      key,
      Buffer.from(signature, 'base64url'),
    );
  } catch {
    return false;
  }
}
