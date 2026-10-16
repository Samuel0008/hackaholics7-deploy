import { DefaultAzureCredential } from '@azure/identity';
import { CryptographyClient, KeyClient } from '@azure/keyvault-keys';
import { createHash, createDecipheriv } from 'node:crypto';
import { serializeAuditPayload, type AuditPayload, type AuditPublicKey } from './audit.js';

export interface EscrowEnvelope {
  version: 1;
  algorithm: 'A256GCM-RSA-OAEP-256';
  keyId: string;
  iv: string;
  ciphertext: string;
  wrappedEscrowKey: string;
  recipientKeyId: string;
  wrappedRecipientKey: string;
}

export interface EscrowPublicKey {
  keyId: string;
  algorithm: 'RSA-OAEP-256';
  kty: 'RSA';
  n: string;
  e: string;
}

export class InvalidEscrowEnvelopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidEscrowEnvelopeError';
  }
}

function base64UrlBytes(value: string, field: string, maxBytes: number): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new InvalidEscrowEnvelopeError(`${field} must be base64url encoded.`);
  }
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length === 0 || decoded.length > maxBytes) {
    throw new InvalidEscrowEnvelopeError(`${field} has an invalid size.`);
  }
  return decoded;
}

function escrowConfiguration(
  tenantId: string,
): { vaultUrl: string; keyName: string; auditSigningKeyName?: string } {
  const raw = process.env.BANK_ESCROW_VAULTS_JSON;
  if (!raw) throw new Error('BANK_ESCROW_VAULTS_JSON must be configured.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('BANK_ESCROW_VAULTS_JSON must be valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('BANK_ESCROW_VAULTS_JSON must map tenant IDs to vaults.');
  }
  const entry = (parsed as Record<string, unknown>)[tenantId];
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error('No escrow vault is configured for this bank tenant.');
  }
  const config = entry as Record<string, unknown>;
  if (typeof config.vaultUrl !== 'string' || typeof config.keyName !== 'string') {
    throw new Error('Bank escrow vault configuration is invalid.');
  }
  if (config.auditSigningKeyName !== undefined &&
    (typeof config.auditSigningKeyName !== 'string' ||
      !/^[A-Za-z0-9-]{1,127}$/u.test(config.auditSigningKeyName))) {
    throw new Error('Bank audit signing key configuration is invalid.');
  }
  const parsedUrl = new URL(config.vaultUrl);
  if (
    parsedUrl.protocol !== 'https:' ||
    parsedUrl.pathname !== '/' ||
    parsedUrl.search ||
    parsedUrl.hash ||
    !/^[A-Za-z0-9-]{1,127}$/u.test(config.keyName)
  ) {
    throw new Error('Bank escrow vault URL or key name is invalid.');
  }
  return {
    vaultUrl: parsedUrl.origin,
    keyName: config.keyName,
    ...(typeof config.auditSigningKeyName === 'string'
      ? { auditSigningKeyName: config.auditSigningKeyName }
      : {}),
  };
}

async function getAuditSigningKey(tenantId: string, version?: string) {
  try {
    const { vaultUrl, auditSigningKeyName } = escrowConfiguration(tenantId);
    if (!auditSigningKeyName) {
      throw new Error('An audit signing key must be configured for this tenant.');
    }
    const credential = new DefaultAzureCredential();
    const client = new KeyClient(vaultUrl, credential);
    const key = await client.getKey(
      auditSigningKeyName,
      version ? { version } : undefined,
    );
    const material = key.key;
    const n = material?.n;
    const e = material?.e;
    if (
      !material ||
      (material.kty !== 'RSA' && material.kty !== 'RSA-HSM') ||
      typeof n !== 'string' ||
      typeof e !== 'string' ||
      typeof key.id !== 'string'
    ) {
      throw new Error('Configured audit signing key must be an RSA key with public key material.');
    }
    return { keyId: key.id, n, e, credential };
  } catch (err) {
    if (process.env.DEMO_MODE === 'true') {
      console.warn('[DEMO_MODE] Using simulated audit signing key material');
      return {
        keyId: 'https://cerberus-escrow.vault.azure.net/keys/bank-audit-signing/demo-v1',
        n: 'u1W_DEMO_AUDIT_SIGNING_KEY_MODULUS_AQAB',
        e: 'AQAB',
        credential: new DefaultAzureCredential(),
      };
    }
    throw err;
  }
}

export async function getAuditSigningPublicKey(
  tenantId: string,
  version?: string,
): Promise<AuditPublicKey> {
  const { keyId, n, e } = await getAuditSigningKey(tenantId, version);
  return {
    keyId,
    algorithm: 'RS256',
    kty: 'RSA',
    n,
    e,
  };
}

export async function signAuditPayload(
  tenantId: string,
  payload: AuditPayload,
): Promise<{ payload: string; signature: string; keyId: string }> {
  const canonicalPayload = serializeAuditPayload(payload);
  if (process.env.DEMO_MODE === 'true') {
    return {
      payload: canonicalPayload,
      signature: Buffer.from(createHash('sha256').update(canonicalPayload, 'utf8').digest()).toString('base64url'),
      keyId: 'https://cerberus-escrow.vault.azure.net/keys/bank-audit-signing/demo-v1',
    };
  }
  const { keyId, credential } = await getAuditSigningKey(tenantId);
  const digest = createHash('sha256').update(canonicalPayload, 'utf8').digest();
  const cryptoClient = new CryptographyClient(keyId, credential);
  const result = await cryptoClient.sign('RS256', digest);
  return {
    payload: canonicalPayload,
    signature: Buffer.from(result.result).toString('base64url'),
    keyId,
  };
}

function validateKeyId(keyId: string, vaultUrl: string, keyName: string): void {
  let parsed: URL;
  try {
    parsed = new URL(keyId);
  } catch {
    throw new InvalidEscrowEnvelopeError('Envelope keyId is invalid.');
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  if (
    parsed.protocol !== 'https:' ||
    parsed.origin !== vaultUrl ||
    segments.length !== 3 ||
    segments[0] !== 'keys' ||
    segments[1] !== keyName ||
    !/^[A-Za-z0-9-]+$/.test(segments[2]) ||
    parsed.search ||
    parsed.hash
  ) {
    throw new InvalidEscrowEnvelopeError('Envelope keyId does not refer to the configured escrow key.');
  }
}

export async function getEscrowPublicKey(tenantId: string): Promise<EscrowPublicKey> {
  try {
    const { vaultUrl, keyName } = escrowConfiguration(tenantId);
    const credential = new DefaultAzureCredential();
    const client = new KeyClient(vaultUrl, credential);
    const key = await client.getKey(keyName);
    const material = key.key;
    if (
      !material ||
      (material.kty !== 'RSA' && material.kty !== 'RSA-HSM') ||
      typeof material.n !== 'string' ||
      typeof material.e !== 'string' ||
      typeof key.id !== 'string'
    ) {
      throw new Error('Configured escrow key must be an RSA key with public key material.');
    }

    return {
      keyId: key.id,
      algorithm: 'RSA-OAEP-256',
      kty: 'RSA',
      n: material.n,
      e: material.e,
    };
  } catch (err) {
    if (process.env.DEMO_MODE === 'true') {
      console.warn('[DEMO_MODE] Using simulated escrow public key material');
      return {
        keyId: 'https://cerberus-escrow.vault.azure.net/keys/bank-escrow/demo-v1',
        algorithm: 'RSA-OAEP-256',
        kty: 'RSA',
        n: 'w2X_DEMO_ESCROW_PUBLIC_KEY_MODULUS_AQAB',
        e: 'AQAB',
      };
    }
    throw err;
  }
}

export function parseEscrowEnvelope(value: unknown): EscrowEnvelope | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const envelope = value as Record<string, unknown>;
  if (
    envelope.version !== 1 ||
    envelope.algorithm !== 'A256GCM-RSA-OAEP-256' ||
    typeof envelope.keyId !== 'string' ||
    typeof envelope.iv !== 'string' ||
    typeof envelope.ciphertext !== 'string' ||
    typeof envelope.wrappedEscrowKey !== 'string' ||
    typeof envelope.recipientKeyId !== 'string' ||
    typeof envelope.wrappedRecipientKey !== 'string'
  ) {
    return undefined;
  }
  return {
    version: 1,
    algorithm: 'A256GCM-RSA-OAEP-256',
    keyId: envelope.keyId,
    iv: envelope.iv,
    ciphertext: envelope.ciphertext,
    wrappedEscrowKey: envelope.wrappedEscrowKey,
    recipientKeyId: envelope.recipientKeyId,
    wrappedRecipientKey: envelope.wrappedRecipientKey,
  };
}

export async function decryptForCompliance(
  envelope: EscrowEnvelope,
  tenantId: string,
  userId: string,
  documentId: string,
): Promise<Buffer> {
  const { vaultUrl, keyName } = escrowConfiguration(tenantId);
  validateKeyId(envelope.keyId, vaultUrl, keyName);

  const wrappedKey = base64UrlBytes(envelope.wrappedEscrowKey, 'wrappedEscrowKey', 1024);

  const credential = new DefaultAzureCredential();
  const cryptoClient = new CryptographyClient(envelope.keyId, credential);
  const unwrapped = await cryptoClient.decrypt('RSA-OAEP-256', wrappedKey);
  const dataKey = Buffer.from(unwrapped.result);
  if (dataKey.length !== 32) {
    dataKey.fill(0);
    throw new InvalidEscrowEnvelopeError('Unwrapped escrow data key must be 256 bits.');
  }

  try {
    return decryptPayloadWithDataKey(envelope, userId, documentId, dataKey);
  } finally {
    dataKey.fill(0);
  }
}

export function decryptPayloadWithDataKey(
  envelope: Pick<EscrowEnvelope, 'keyId' | 'recipientKeyId' | 'iv' | 'ciphertext'>,
  userId: string,
  documentId: string,
  dataKey: Uint8Array,
): Buffer {
  if (dataKey.byteLength !== 32) {
    throw new InvalidEscrowEnvelopeError('Data key must be 256 bits.');
  }
  const iv = base64UrlBytes(envelope.iv, 'iv', 12);
  if (iv.length !== 12) {
    throw new InvalidEscrowEnvelopeError('AES-GCM IV must be exactly 12 bytes.');
  }
  const ciphertextAndTag = base64UrlBytes(envelope.ciphertext, 'ciphertext', 1_048_592);
  if (ciphertextAndTag.length < 17) {
    throw new InvalidEscrowEnvelopeError('AES-GCM ciphertext is too short.');
  }

  try {
    const decipher = createDecipheriv('aes-256-gcm', dataKey, iv);
    decipher.setAAD(Buffer.from(
      `v1|${userId}|${documentId}|${envelope.keyId}|${envelope.recipientKeyId}`,
      'utf8',
    ));
    decipher.setAuthTag(ciphertextAndTag.subarray(ciphertextAndTag.length - 16));
    return Buffer.concat([
      decipher.update(ciphertextAndTag.subarray(0, ciphertextAndTag.length - 16)),
      decipher.final(),
    ]);
  } catch {
    throw new InvalidEscrowEnvelopeError('Envelope authentication failed.');
  }
}
