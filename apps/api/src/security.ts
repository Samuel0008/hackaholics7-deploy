import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose';
import { createHash, createPublicKey, timingSafeEqual } from 'node:crypto';
import {
  getDevice,
  isUserQuarantined,
  isUserReauthenticationRequired,
  getUserSessionVersion,
} from './storage.js';

export const BANK_ROLES = {
  employee: 'Bank.Employee',
  securityAdmin: 'Bank.SecurityAdmin',
  compliance: 'Bank.Compliance',
} as const;

export interface BankIdentity {
  tenantId: string;
  clientId: string;
  subject: string;
  roles: string[];
}

export function isDelegatedUserClaims(payload: Record<string, unknown>): boolean {
  return typeof payload.oid === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
      .test(payload.oid) &&
    typeof payload.scp === 'string' &&
    payload.scp.trim().length > 0 &&
    payload.idtyp !== 'app';
}

export class BankAuthorizationError extends Error {
  constructor(readonly statusCode: 401 | 403 | 503, message: string) {
    super(message);
    this.name = 'BankAuthorizationError';
  }
}

export function verifyGatewayHeader(
  supplied: string | null,
  expected: string | undefined,
): boolean {
  if (expected === undefined) return true;
  const expectedBytes = Buffer.from(expected, 'utf8');
  if (expectedBytes.byteLength < 32) {
    throw new Error('GATEWAY_SHARED_SECRET must contain at least 32 bytes.');
  }
  if (!supplied) return false;
  const suppliedBytes = Buffer.from(supplied, 'utf8');
  return suppliedBytes.byteLength === expectedBytes.byteLength &&
    timingSafeEqual(suppliedBytes, expectedBytes);
}

const tenantJwks = createRemoteJWKSet(
  new URL('https://login.microsoftonline.com/common/discovery/v2.0/keys'),
);

function configuredBankTenants(): Record<string, string[]> {
  const raw = process.env.BANK_TENANTS_JSON;
  if (!raw) {
    throw new BankAuthorizationError(
      503,
      'Bank Entra tenant allowlist is not configured.',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new BankAuthorizationError(503, 'Bank Entra tenant allowlist is invalid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new BankAuthorizationError(503, 'Bank Entra tenant allowlist must be an object.');
  }

  const result: Record<string, string[]> = {};
  for (const [tenantId, clients] of Object.entries(parsed)) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
        .test(tenantId) ||
      !Array.isArray(clients) ||
      clients.length === 0 ||
      clients.some((clientId) =>
        typeof clientId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
          .test(clientId)
      )
    ) {
      throw new BankAuthorizationError(503, 'Bank Entra tenant allowlist entry is invalid.');
    }
    result[tenantId.toLowerCase()] = clients.map((clientId) => clientId.toLowerCase());
  }
  return result;
}

export async function requireBankRole(
  authorization: string | null,
  requiredRole: string,
): Promise<BankIdentity> {
  if (!authorization?.startsWith('Bearer ')) {
    throw new BankAuthorizationError(401, 'A bank Entra access token is required.');
  }

  const audience = process.env.AZURE_API_AUDIENCE;
  if (!audience) {
    throw new BankAuthorizationError(503, 'AZURE_API_AUDIENCE is not configured.');
  }
  const allowedTenants = configuredBankTenants();

  let payload;
  try {
    const { payload: verifiedPayload } = await jwtVerify(
      authorization.slice('Bearer '.length),
      tenantJwks,
      {
        algorithms: ['RS256'],
        audience,
        requiredClaims: ['tid', 'sub', 'iat', 'exp'],
      },
    );
    payload = verifiedPayload;
  } catch {
    throw new BankAuthorizationError(401, 'Bank Entra access token is invalid or expired.');
  }

  if (
    typeof payload.tid !== 'string' ||
    typeof payload.azp !== 'string'
  ) {
    throw new BankAuthorizationError(401, 'Bank access token is missing required identity claims.');
  }
  if (!isDelegatedUserClaims(payload)) {
    throw new BankAuthorizationError(
      403,
      'A delegated user token is required; application-only tokens cannot create employee sessions.',
    );
  }

  const tenantId = payload.tid.toLowerCase();
  const issuer = `https://login.microsoftonline.com/${tenantId}/v2.0`;
  if (payload.iss !== issuer) {
    throw new BankAuthorizationError(401, 'Bank access token issuer is invalid.');
  }

  const clients = allowedTenants[tenantId];
  if (!clients) {
    throw new BankAuthorizationError(403, 'This bank tenant is not onboarded.');
  }
  if (!clients.includes(payload.azp.toLowerCase())) {
    throw new BankAuthorizationError(403, 'This bank application is not approved.');
  }

  const roles = Array.isArray(payload.roles)
    ? payload.roles.filter((role): role is string => typeof role === 'string')
    : [];
  if (!roles.includes(requiredRole)) {
    throw new BankAuthorizationError(403, `The bank application lacks the ${requiredRole} role.`);
  }

  return {
    tenantId,
    clientId: payload.azp.toLowerCase(),
    subject: (payload.oid as string).toLowerCase(),
    roles,
  };
}

export function scopeBankUserId(tenantId: string, userId: string): string {
  return `${tenantId}_${createHash('sha256').update(userId, 'utf8').digest('hex')}`;
}

export function isScopedBankUserId(value: unknown, tenantId: string): value is string {
  return typeof value === 'string' &&
    value.startsWith(`${tenantId}_`) &&
    new RegExp(`^${tenantId}_[a-f0-9]{64}$`, 'u').test(value);
}

export interface DemoSession {
  userId: string;
  deviceId: string;
  tenantId: string;
  sessionVersion: number;
}

function jwtKey(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error('JWT_SECRET must contain at least 32 bytes.');
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(session: DemoSession): Promise<string> {
  return new SignJWT({
    deviceId: session.deviceId,
    tenantId: session.tenantId,
    sessionVersion: session.sessionVersion,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(session.userId)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(jwtKey());
}

export async function readSessionToken(token: string): Promise<DemoSession | undefined> {
  const session = await readSessionTokenClaims(token);
  if (!session ||
    await isUserQuarantined(session.userId) ||
    await isUserReauthenticationRequired(session.userId) ||
    session.sessionVersion !== await getUserSessionVersion(session.userId)) return undefined;
  const device = await getDevice(session.userId, session.deviceId);
  if (!device || device.status !== 'active') return undefined;
  return session;
}

export async function readSessionTokenClaims(token: string): Promise<DemoSession | undefined> {
  try {
    const { payload } = await jwtVerify(token, jwtKey());
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.deviceId !== 'string' ||
      typeof payload.tenantId !== 'string' ||
      typeof payload.sessionVersion !== 'number' ||
      !Number.isSafeInteger(payload.sessionVersion) ||
      payload.sessionVersion < 0
    ) {
      return undefined;
    }

    return {
      userId: payload.sub,
      deviceId: payload.deviceId,
      tenantId: payload.tenantId,
      sessionVersion: payload.sessionVersion,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'JWTExpired') return undefined;
    if (error instanceof Error && error.name === 'JWTClaimValidationFailed') return undefined;
    if (error instanceof Error && error.name === 'JWSSignatureVerificationFailed') return undefined;
    if (error instanceof Error && error.name === 'JWTInvalid') return undefined;
    if (error instanceof Error && error.name === 'JWSInvalid') return undefined;
    throw error;
  }
}

export function isSafeUserId(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[a-zA-Z0-9_-]{1,64}$/.test(value);
}

export function isSafeId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
}

export interface MessageEncryptionJwk {
  kty: 'RSA';
  n: string;
  e: string;
  alg?: 'RSA-OAEP-256';
  use?: 'enc';
  key_ops?: string[];
}

export function validateMessageEncryptionJwk(value: unknown): MessageEncryptionJwk | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const jwk = value as Record<string, unknown>;
  if (
    jwk.kty !== 'RSA' ||
    typeof jwk.n !== 'string' ||
    typeof jwk.e !== 'string' ||
    !/^[A-Za-z0-9_-]{1,2048}$/.test(jwk.n) ||
    !/^[A-Za-z0-9_-]{1,16}$/.test(jwk.e) ||
    (jwk.alg !== undefined && jwk.alg !== 'RSA-OAEP-256') ||
    (jwk.use !== undefined && jwk.use !== 'enc') ||
    (jwk.key_ops !== undefined &&
      (!Array.isArray(jwk.key_ops) || !jwk.key_ops.includes('encrypt')))
  ) {
    return undefined;
  }

  try {
    const publicKey = createPublicKey({
      key: { kty: 'RSA', n: jwk.n, e: jwk.e },
      format: 'jwk',
    });
    if (
      publicKey.asymmetricKeyType !== 'rsa' ||
      (publicKey.asymmetricKeyDetails?.modulusLength ?? 0) < 3072
    ) {
      return undefined;
    }
  } catch {
    return undefined;
  }

  return { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RSA-OAEP-256', use: 'enc' };
}
