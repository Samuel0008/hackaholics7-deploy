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

export function isDelegatedUserClaims(
  payload: Record<string, unknown>,
  requiredScope = 'access_as_user',
): boolean {
  return typeof payload.oid === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
      .test(payload.oid) &&
    typeof payload.scp === 'string' &&
    payload.scp.split(/\s+/u).includes(requiredScope) &&
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
  const isDemo = process.env.DEMO_MODE === 'true';

  if (!authorization?.startsWith('Bearer ')) {
    throw new BankAuthorizationError(401, 'A bank Entra access token is required.');
  }

  const token = authorization.slice('Bearer '.length).trim();

  // If in DEMO_MODE and receiving a simulated token, grant full zero-trust demonstration roles
  if (isDemo && (token.startsWith('demo-') || token === 'mock-token' || token === 'simulated-token')) {
    console.log(`[DEMO_MODE] Granting simulated identity with role: ${requiredRole}`);
    return {
      tenantId: '8c9b0c95-5e24-468d-8abe-d351e1af1ab6',
      clientId: '6e014910-34c1-4e73-bc47-73a857b35983',
      subject: '00000000-0000-0000-0000-000000000001',
      roles: ['Bank.Employee', 'Bank.SecurityAdmin', 'Bank.Compliance'],
    };
  }

  const rawAud = process.env.AZURE_API_AUDIENCE || 'api://8a9faea3-fc28-4e60-9d45-4fd8e86a50ac';
  const cleanAud = rawAud.replace(/^api:\/\//i, '');
  const acceptedAudiences = [rawAud, cleanAud, `api://${cleanAud}`];

  const allowedTenants = configuredBankTenants();

  let payload: Record<string, unknown>;
  try {
    const { payload: verifiedPayload } = await jwtVerify(
      token,
      tenantJwks,
      {
        algorithms: ['RS256'],
        audience: acceptedAudiences,
        requiredClaims: ['tid', 'sub', 'iat', 'exp'],
      },
    );
    payload = verifiedPayload as Record<string, unknown>;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[requireBankRole] JWT verification failed: ${errorMsg}`);

    if (isDemo) {
      console.warn(`[DEMO_MODE] Bypassing JWT verification failure for demonstration purposes.`);
      return {
        tenantId: '8c9b0c95-5e24-468d-8abe-d351e1af1ab6',
        clientId: '6e014910-34c1-4e73-bc47-73a857b35983',
        subject: '00000000-0000-0000-0000-000000000001',
        roles: ['Bank.Employee', 'Bank.SecurityAdmin', 'Bank.Compliance'],
      };
    }

    throw new BankAuthorizationError(401, `Bank Entra access token is invalid or expired: ${errorMsg}`);
  }

  const tenantId = (typeof payload.tid === 'string' ? payload.tid : '8c9b0c95-5e24-468d-8abe-d351e1af1ab6').toLowerCase();
  const clientId = (typeof payload.azp === 'string' ? payload.azp : '6e014910-34c1-4e73-bc47-73a857b35983').toLowerCase();
  const subject = typeof payload.oid === 'string' ? payload.oid.toLowerCase() : '00000000-0000-0000-0000-000000000001';

  if (!isDelegatedUserClaims(payload)) {
    if (isDemo) {
      console.warn(`[DEMO_MODE] Bypassing delegated user claim validation for presentation.`);
    } else {
      throw new BankAuthorizationError(
        403,
        'A delegated user token is required; application-only tokens cannot create employee sessions.',
      );
    }
  }

  const issuer = `https://login.microsoftonline.com/${tenantId}/v2.0`;
  if (payload.iss !== issuer && !isDemo) {
    console.error(`[requireBankRole] Issuer mismatch: expected ${issuer}, got ${payload.iss}`);
    throw new BankAuthorizationError(401, `Bank access token issuer is invalid. Expected: ${issuer}`);
  }

  const clients = allowedTenants[tenantId];
  if (!clients && !isDemo) {
    throw new BankAuthorizationError(403, `This bank tenant (${tenantId}) is not onboarded.`);
  }
  if (clients && !clients.includes(clientId) && !isDemo) {
    throw new BankAuthorizationError(403, `This bank application (${clientId}) is not approved.`);
  }

  let roles = Array.isArray(payload.roles)
    ? payload.roles.filter((role): role is string => typeof role === 'string')
    : [];

  if (isDemo && !roles.includes(requiredRole)) {
    console.log(`[DEMO_MODE] Elevating signed-in user roles to include ${requiredRole}`);
    roles = ['Bank.Employee', 'Bank.SecurityAdmin', 'Bank.Compliance'];
  } else if (!roles.includes(requiredRole)) {
    throw new BankAuthorizationError(403, `The bank application lacks the ${requiredRole} role.`);
  }

  return {
    tenantId,
    clientId,
    subject,
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
