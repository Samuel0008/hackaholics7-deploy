import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { createHash, randomUUID } from 'node:crypto';
import {
  createDecoyAuditExport,
  createDecoyDatabaseBackup,
  createDecoyDebugConfig,
  createDecoyEnvironmentFile,
  createDecoyRobotsText,
} from '../decoy.js';
import {
  decryptForCompliance,
  getAuditSigningPublicKey,
  getEscrowPublicKey,
  InvalidEscrowEnvelopeError,
  parseEscrowEnvelope,
} from '../escrow.js';
import {
  isDemoComplianceStatus,
  isDemoDeviceAction,
  isValidActionReason,
} from '../device-actions.js';
import {
  consumeChallenge,
  clearUserReauthentication,
  createCanary,
  createDeviceAction,
  decideDeviceAction,
  getCredential,
  getEncryptedDocument,
  getDevice,
  getUserSessionVersion,
  getUserReauthenticationRequiredAt,
  isUserReauthenticationRequired,
  isUserQuarantined,
  listCanaryAlerts,
  listCredentials,
  listDeviceActions,
  listEscrowAccesses,
  listMessagePublicKeys,
  recordCanaryAccess,
  recordDemoDeviceCompliance,
  recordEscrowAccess,
  recordIdentifiedDecoyAccess,
  recordPublicDecoyAccess,
  releaseUserQuarantine,
  saveChallenge,
  saveCredential,
  saveDevice,
  type StoredDevice,
  saveEncryptedDocument,
  saveMessagePublicKey,
  type StoredCredential,
} from '../storage.js';
import {
  BANK_ROLES,
  BankAuthorizationError,
  createSessionToken,
  isSafeId,
  isSafeUserId,
  isScopedBankUserId,
  readSessionToken,
  readSessionTokenClaims,
  requireBankRole,
  scopeBankUserId,
  validateMessageEncryptionJwk,
  verifyGatewayHeader,
} from '../security.js';

type Handler = (request: HttpRequest, context: InvocationContext) => Promise<HttpResponseInit>;
type BankHandler = (
  request: HttpRequest,
  context: InvocationContext,
  identity: Awaited<ReturnType<typeof requireBankRole>>,
) => Promise<HttpResponseInit>;

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function json(status: number, body: unknown): HttpResponseInit {
  const allowedOrigin = process.env.ALLOWED_ORIGIN;
  return {
    status,
    jsonBody: body,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(allowedOrigin ? {
        'access-control-allow-origin': allowedOrigin,
        'access-control-allow-headers': 'authorization,content-type',
        'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
        'vary': 'Origin',
      } : {}),
    },
  };
}

function withErrors(name: string, handler: Handler): Handler {
  return async (request, context) => {
    try {
      if (!verifyGatewayHeader(
        request.headers.get('x-bank-gateway-key'),
        process.env.GATEWAY_SHARED_SECRET,
      )) {
        return json(404, { error: 'Not found.' });
      }
      return await handler(request, context);
    } catch (error) {
      if (error instanceof BankAuthorizationError) {
        if (error.statusCode === 401) {
          return {
            ...json(error.statusCode, { error: error.message }),
            headers: {
              ...json(error.statusCode, {}).headers,
              'www-authenticate': 'Bearer',
            },
          };
        }
        return json(error.statusCode, { error: error.message });
      }
      context.error(`${name} failed`, error);
      return json(500, { error: 'Internal server error' });
    }
  };
}

function withBankRole(name: string, role: string, handler: BankHandler): Handler {
  return withErrors(name, async (request, context) => {
    const identity = await requireBankRole(request.headers.get('authorization'), role);
    if (name !== 'authenticationOptions' && name !== 'authenticationVerify') {
      const userId = scopeBankUserId(identity.tenantId, identity.subject);
      if (await isUserQuarantined(userId)) {
        return json(403, { error: 'This account is quarantined pending security review.' });
      }
      if (await isUserReauthenticationRequired(userId)) {
        return json(403, {
          error: 'Fresh passkey authentication is required before protected operations can continue.',
        });
      }
    }
    return handler(request, context, identity);
  });
}

async function readJson(request: HttpRequest): Promise<Record<string, unknown> | undefined> {
  try {
    const body: unknown = await request.json();
    return isJsonObject(body) ? body : undefined;
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

function isRegistrationResponse(value: unknown): value is RegistrationResponseJSON {
  if (!value || typeof value !== 'object') return false;
  const credential = value as Record<string, unknown>;
  const response = credential.response;
  if (!response || typeof response !== 'object') return false;
  const data = response as Record<string, unknown>;
  return typeof credential.id === 'string' &&
    typeof credential.rawId === 'string' &&
    credential.type === 'public-key' &&
    typeof data.clientDataJSON === 'string' &&
    typeof data.attestationObject === 'string';
}

function isAuthenticationResponse(value: unknown): value is AuthenticationResponseJSON {
  if (!value || typeof value !== 'object') return false;
  const credential = value as Record<string, unknown>;
  const response = credential.response;
  if (!response || typeof response !== 'object') return false;
  const data = response as Record<string, unknown>;
  return typeof credential.id === 'string' &&
    typeof credential.rawId === 'string' &&
    credential.type === 'public-key' &&
    typeof data.clientDataJSON === 'string' &&
    typeof data.authenticatorData === 'string' &&
    typeof data.signature === 'string';
}

function relyingParty(): { rpId: string; expectedOrigin: string; rpName: string } {
  const { RP_ID, EXPECTED_ORIGIN, RP_NAME } = process.env;
  if (!RP_ID || !EXPECTED_ORIGIN || !RP_NAME) {
    throw new Error('RP_ID, EXPECTED_ORIGIN, and RP_NAME must be configured.');
  }
  return { rpId: RP_ID, expectedOrigin: EXPECTED_ORIGIN, rpName: RP_NAME };
}

async function authorizedSession(request: HttpRequest) {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return undefined;
  return readSessionToken(authorization.slice('Bearer '.length));
}

app.http('health', {
  route: 'health',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: withErrors('health', async () => json(200, { status: 'ok', demo: true })),
});

app.http('apiRobots', {
  route: 'robots.txt',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: withErrors('apiRobots', async () => ({
    status: 200,
    body: createDecoyRobotsText(),
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=300',
      'x-content-type-options': 'nosniff',
    },
  })),
});

async function quarantineVerifiedUser(
  request: HttpRequest,
  decoyId: string,
  occurredAt: string,
  context: InvocationContext,
  expectedTenantId?: string,
): Promise<boolean> {
  const authorization = request.headers.get('authorization');
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : undefined;
  if (!token) return false;

  const session = await readSessionTokenClaims(token);
  if (session) {
    if (expectedTenantId && session.tenantId !== expectedTenantId) return false;
    const action = await recordIdentifiedDecoyAccess({
      tenantId: session.tenantId,
      userId: session.userId,
      deviceId: session.deviceId,
      decoyId,
      occurredAt,
    });
    if (action !== 'already-suspended') {
      context.warn(
        action === 'account-suspended'
          ? `Account suspended pending investigation after a repeated verified hit on decoy ${decoyId}.`
          : `Existing sessions invalidated after verified identity accessed decoy ${decoyId}.`,
      );
    }
    return true;
  }

  try {
    const bank = await requireBankRole(authorization, BANK_ROLES.employee);
    if (expectedTenantId && bank.tenantId !== expectedTenantId) return false;
    const action = await recordIdentifiedDecoyAccess({
      tenantId: bank.tenantId,
      userId: scopeBankUserId(bank.tenantId, bank.subject),
      decoyId,
      occurredAt,
    });
    if (action !== 'already-suspended') {
      context.warn(
        action === 'account-suspended'
          ? `Account suspended pending investigation after a repeated verified hit on decoy ${decoyId}.`
          : `Existing sessions invalidated after verified identity accessed decoy ${decoyId}.`,
      );
    }
    return true;
  } catch (error) {
    if (error instanceof BankAuthorizationError &&
      (error.statusCode === 401 || error.statusCode === 403)) return false;
    throw error;
  }
}

function decoySurface(
  id: string,
  contentType: string,
  body: string | object,
): Handler {
  return withErrors(`decoy:${id}`, async (request, context) => {
    const occurredAt = new Date().toISOString();
    const identified = await quarantineVerifiedUser(request, id, occurredAt, context);
    if (!identified) {
      const tenantId = process.env.DECOY_TENANT_ID;
      if (
        tenantId &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
          .test(tenantId)
      ) {
        throw new Error('DECOY_TENANT_ID must be a valid tenant GUID.');
      }
      const recorded = await recordPublicDecoyAccess(id, occurredAt, tenantId);
      if (!recorded) context.info(`Anonymous decoy alert-write limit reached for ${id}.`);
    }
    return {
      status: 200,
      ...(typeof body === 'string' ? { body } : { jsonBody: body }),
      headers: {
        'content-type': contentType,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'x-decoy-classification': 'SYNTHETIC-DECOY-NOT-REAL',
        'content-disposition': `attachment; filename="${id.replaceAll('/', '-')}"`,
      },
    };
  });
}

app.http('decoyEnvironmentFile', {
  route: '.env',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: decoySurface(
    'environment-file',
    'text/plain; charset=utf-8',
    createDecoyEnvironmentFile(),
  ),
});

app.http('decoyDebugConfig', {
  route: 'debug/config',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: decoySurface(
    'debug-config',
    'application/json; charset=utf-8',
    createDecoyDebugConfig(),
  ),
});

app.http('decoyDatabaseBackup', {
  route: 'backup/database.sql',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: decoySurface(
    'database-backup',
    'application/sql; charset=utf-8',
    createDecoyDatabaseBackup(),
  ),
});

app.http('publicDecoyAuditExport', {
  route: 'internal/employee/access-review-export.json',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: decoySurface(
    'access-review-export',
    'application/json; charset=utf-8',
    createDecoyAuditExport(),
  ),
});

app.http('registrationOptions', {
  route: 'passkeys/register/options',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: withBankRole('registrationOptions', BANK_ROLES.employee, async (request, _context, bank) => {
    const body = await readJson(request);
    if (!body || typeof body.userName !== 'string' ||
      body.userName.length < 1 || body.userName.length > 128) {
      return json(400, { error: 'Provide a valid userName.' });
    }

    const userId = scopeBankUserId(bank.tenantId, bank.subject);
    if (await isUserQuarantined(userId)) {
      return json(403, { error: 'This account is quarantined pending security review.' });
    }
    if (await isUserReauthenticationRequired(userId)) {
      return json(403, {
        error: 'Reauthenticate with an enrolled passkey before registering another passkey.',
      });
    }
    const { rpId, rpName } = relyingParty();
    const credentials = await listCredentials(userId);
    const options = await generateRegistrationOptions({
      rpName,
      rpID: rpId,
      userName: body.userName,
      userDisplayName: body.userName,
      userID: createHash('sha256').update(userId, 'utf8').digest(),
      attestationType: 'none',
      excludeCredentials: credentials
        .filter((credential) => !credential.revoked)
        .map(({ id, transports }) => ({ id, transports })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'required',
      },
    });
    await saveChallenge('registration', userId, options.challenge);
    return json(200, options);
  }),
});

app.http('registrationVerify', {
  route: 'passkeys/register/verify',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: withBankRole('registrationVerify', BANK_ROLES.employee, async (request, context, bank) => {
    const body = await readJson(request);
    if (!body || !isRegistrationResponse(body.response)) {
      return json(400, { error: 'Provide a valid registration response.' });
    }

    const userId = scopeBankUserId(bank.tenantId, bank.subject);
    if (await isUserQuarantined(userId)) {
      return json(403, { error: 'This account is quarantined pending security review.' });
    }
    if (await isUserReauthenticationRequired(userId)) {
      return json(403, {
        error: 'Passkey enrollment is temporarily restricted; reauthenticate with an enrolled passkey.',
      });
    }
    const expectedChallenge = await consumeChallenge('registration', userId);
    if (!expectedChallenge) return json(400, { error: 'Registration challenge is missing or expired.' });

    const { rpId, expectedOrigin } = relyingParty();
    let result: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
    try {
      result = await verifyRegistrationResponse({
        response: body.response,
        expectedChallenge,
        expectedOrigin,
        expectedRPID: rpId,
        requireUserVerification: true,
      });
    } catch (error) {
      context.warn('Passkey registration response rejected', error);
      return json(400, { error: 'Passkey registration response was invalid.' });
    }
    if (!result.verified) return json(400, { error: 'Passkey registration was not verified.' });

    const deviceId = randomUUID();
    const credential = result.registrationInfo.credential;
    const stored: StoredCredential = {
      id: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      counter: credential.counter,
      transports: credential.transports ?? [],
      deviceId,
      revoked: false,
    };
    await saveCredential(userId, stored);
    await saveDevice({
      userId,
      deviceId,
      status: 'active',
      createdAt: new Date().toISOString(),
    });

    return json(201, { verified: true, deviceId });
  }),
});

app.http('authenticationOptions', {
  route: 'passkeys/auth/options',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: withBankRole('authenticationOptions', BANK_ROLES.employee, async (request, _context, bank) => {
    const userId = scopeBankUserId(bank.tenantId, bank.subject);
    if (await isUserQuarantined(userId)) {
      return json(403, { error: 'This account is quarantined pending security review.' });
    }
    const credentials = (await listCredentials(userId)).filter((credential) => !credential.revoked);
    if (credentials.length === 0) return json(404, { error: 'No active demo passkeys are registered.' });

    const { rpId } = relyingParty();
    const options = await generateAuthenticationOptions({
      rpID: rpId,
      allowCredentials: credentials.map(({ id, transports }) => ({ id, transports })),
      userVerification: 'required',
    });
    await saveChallenge('authentication', userId, options.challenge);
    return json(200, options);
  }),
});

app.http('authenticationVerify', {
  route: 'passkeys/auth/verify',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: withBankRole('authenticationVerify', BANK_ROLES.employee, async (request, context, bank) => {
    const body = await readJson(request);
    if (!body || !isAuthenticationResponse(body.response)) {
      return json(400, { error: 'Provide a valid authentication response.' });
    }

    const userId = scopeBankUserId(bank.tenantId, bank.subject);
    if (await isUserQuarantined(userId)) {
      return json(403, { error: 'This account is quarantined pending security review.' });
    }
    const existing = await getCredential(userId, body.response.id);
    if (!existing || existing.revoked) return json(401, { error: 'Passkey is not active.' });
    const device = await getDevice(userId, existing.deviceId);
    if (!device || device.status !== 'active') return json(401, { error: 'Device is revoked.' });
    const reauthenticationRequiredAt = await getUserReauthenticationRequiredAt(userId);
    const expectedChallenge = await consumeChallenge(
      'authentication',
      userId,
      reauthenticationRequiredAt,
    );
    if (!expectedChallenge) return json(400, { error: 'Authentication challenge is missing or expired.' });

    const { rpId, expectedOrigin } = relyingParty();
    let result: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
    try {
      result = await verifyAuthenticationResponse({
        response: body.response,
        expectedChallenge,
        expectedOrigin,
        expectedRPID: rpId,
        credential: {
          id: existing.id,
          publicKey: Buffer.from(existing.publicKey, 'base64url'),
          counter: existing.counter,
          transports: existing.transports,
        },
        requireUserVerification: true,
      });
    } catch (error) {
      context.warn('Passkey authentication response rejected', error);
      return json(401, { error: 'Passkey authentication response was invalid.' });
    }
    if (!result.verified) return json(401, { error: 'Passkey authentication was not verified.' });

    const sessionVersion = await getUserSessionVersion(userId);
    if (!await clearUserReauthentication(
      userId,
      bank.tenantId,
      reauthenticationRequiredAt,
    )) {
      return json(401, { error: 'Security state changed; request a new passkey challenge.' });
    }

    await saveCredential(userId, {
      ...existing,
      counter: result.authenticationInfo.newCounter,
    });
    const token = await createSessionToken({
      userId,
      deviceId: existing.deviceId,
      tenantId: bank.tenantId,
      sessionVersion,
    });
    return json(200, {
      verified: true,
      token,
      userId: bank.subject,
      sessionUserId: userId,
      expiresInSeconds: 900,
    });
  }),
});

app.http('syncDocument', {
  route: 'sync/{documentId}',
  methods: ['GET', 'PUT'],
  authLevel: 'anonymous',
  handler: withErrors('syncDocument', async (request) => {
    const session = await authorizedSession(request);
    if (!session) return json(401, { error: 'A valid demo session token is required.' });
    const documentId = request.params.documentId;
    if (!isSafeId(documentId)) return json(400, { error: 'Invalid document ID.' });

    if (request.method === 'PUT') {
      const body = await readJson(request);
      if (!body || typeof body.encryptedEnvelope !== 'string' ||
        body.encryptedEnvelope.length < 1 || body.encryptedEnvelope.length > 48_000) {
        return json(400, { error: 'encryptedEnvelope must be a non-empty string up to 48 KB.' });
      }
      await saveEncryptedDocument(session.userId, documentId, body.encryptedEnvelope);
      return json(200, { saved: true });
    }

    const encryptedEnvelope = await getEncryptedDocument(session.userId, documentId);
    if (!encryptedEnvelope) return json(404, { error: 'Encrypted document not found.' });
    return json(200, { documentId, encryptedEnvelope });
  }),
});

app.http('registerMessageKey', {
  route: 'keys/message',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: withErrors('registerMessageKey', async (request) => {
    const session = await authorizedSession(request);
    if (!session) return json(401, { error: 'A valid demo session token is required.' });
    const body = await readJson(request);
    const publicJwk = validateMessageEncryptionJwk(body?.publicJwk);
    if (!publicJwk) {
      return json(400, {
        error: 'Provide an RSA-OAEP-256 public JWK with at least a 3072-bit modulus.',
      });
    }

    const keyId = randomUUID();
    await saveMessagePublicKey({
      userId: session.userId,
      keyId,
      publicJwk: JSON.stringify(publicJwk),
      deviceId: session.deviceId,
      createdAt: new Date().toISOString(),
    });
    return json(201, {
      keyId,
      publicKey: {
        keyId,
        algorithm: 'RSA-OAEP-256',
        kty: publicJwk.kty,
        n: publicJwk.n,
        e: publicJwk.e,
      },
    });
  }),
});

app.http('getMessageKeys', {
  route: 'keys/message/{userId}',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: withErrors('getMessageKeys', async (request) => {
    const session = await authorizedSession(request);
    if (!session) return json(401, { error: 'A valid demo session token is required.' });
    const userId = request.params.userId;
    if (!isSafeUserId(userId)) return json(400, { error: 'Invalid user ID.' });

    const recipientUserId = scopeBankUserId(session.tenantId, userId);
    const keys = await listMessagePublicKeys(recipientUserId);
    const activeKeys = await Promise.all(keys.map(async (key) => ({
      key,
      device: await getDevice(recipientUserId, key.deviceId),
    })));
    return json(200, {
      keys: activeKeys
        .filter(({ device }) => device?.status === 'active')
        .map(({ key }) => {
          const publicJwk = JSON.parse(key.publicJwk) as {
            kty: 'RSA';
            n: string;
            e: string;
          };
          return {
            keyId: key.keyId,
            algorithm: 'RSA-OAEP-256',
            kty: publicJwk.kty,
            n: publicJwk.n,
            e: publicJwk.e,
            createdAt: key.createdAt,
          };
        }),
    });
  }),
});

app.http('createCanary', {
  route: 'security/canaries',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: withBankRole('createCanary', BANK_ROLES.securityAdmin, async (request, _context, bank) => {
    const token = await createCanary(bank.tenantId);
    return json(201, {
      canaryUrl:
        `${new URL(request.url).origin}/api/internal/employee/audit-export/${bank.tenantId}/${token}`,
      expiresInSeconds: 86400,
      exposure: 'backend-only',
    });
  }),
});

app.http('canaryAccess', {
  route: 'internal/employee/audit-export/{tenantId}/{token}',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: withErrors('canaryAccess', async (request, context) => {
    const tenantId = request.params.tenantId;
    const token = request.params.token;
    if (!isSafeId(tenantId) || !isSafeId(token)) return json(404, { error: 'Not found.' });
    const recorded = await recordCanaryAccess(tenantId, token);
    if (!recorded) return json(404, { error: 'Not found.' });
    await quarantineVerifiedUser(
      request,
      'tenant-canary',
      new Date().toISOString(),
      context,
      tenantId,
    );
    return json(404, { error: 'Not found.' });
  }),
});

app.http('canaryAlerts', {
  route: 'security/alerts',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: withBankRole('canaryAlerts', BANK_ROLES.securityAdmin, async (_request, _context, bank) => {
    return json(200, { alerts: await listCanaryAlerts(100, bank.tenantId) });
  }),
});

app.http('securityDashboardTelemetry', {
  route: 'security/dashboard/telemetry',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: withBankRole(
    'securityDashboardTelemetry',
    BANK_ROLES.securityAdmin,
    async (_request, _context, bank) => {
      const alerts = await listCanaryAlerts(100, bank.tenantId);
      return json(200, {
        source: 'tenant-decoy-alerts',
        generatedAt: new Date().toISOString(),
        capabilities: {
          decoyAlertHistory: true,
          sourceIpAttribution: false,
          networkFingerprinting: false,
          networkQuarantine: false,
        },
        summary: {
          totalAlerts: alerts.length,
          identifiedAlerts: alerts.filter((alert) => Boolean(alert.userId)).length,
          containmentActions: alerts.filter((alert) =>
            alert.action === 'reauthentication-required' ||
            alert.action === 'account-suspended'
          ).length,
        },
        alerts,
      });
    },
  ),
});

app.http('cryptoRegistry', {
  route: 'security/crypto/registry',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: withBankRole('cryptoRegistry', BANK_ROLES.securityAdmin, async (_request, _context, bank) => {
    const [escrowKey, auditSigningKey] = await Promise.all([
      getEscrowPublicKey(bank.tenantId),
      getAuditSigningPublicKey(bank.tenantId),
    ]);
    return json(200, {
      storageProvider: 'Azure Table Storage',
      keys: [
        {
          purpose: 'escrow-encryption',
          keyId: escrowKey.keyId,
          algorithm: escrowKey.algorithm,
          keyType: escrowKey.kty,
        },
        {
          purpose: 'audit-signing',
          keyId: auditSigningKey.keyId,
          algorithm: auditSigningKey.algorithm,
          keyType: auditSigningKey.kty,
        },
      ],
      unsupportedClaims: [
        'hardware-backed client key attestation',
        'key access counts',
        'key rotation history',
        'immutable audit retention',
      ],
    });
  }),
});

app.http('auditSigningPublicKey', {
  route: 'security/audit/public-key',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: withBankRole(
    'auditSigningPublicKey',
    BANK_ROLES.securityAdmin,
    async (request, _context, bank) => {
      const version = request.query.get('version') ?? undefined;
      if (version !== undefined && !/^[A-Za-z0-9-]{1,64}$/u.test(version)) {
        return json(400, { error: 'The audit signing key version is invalid.' });
      }
      return json(200, {
        publicKey: await getAuditSigningPublicKey(bank.tenantId, version),
      });
    },
  ),
});

app.http('releaseQuarantine', {
  route: 'security/quarantine/release',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: withBankRole(
    'releaseQuarantine',
    BANK_ROLES.securityAdmin,
    async (request, _context, bank) => {
      const body = await readJson(request);
      if (!body || !isScopedBankUserId(body.userId, bank.tenantId)) {
        return json(400, { error: 'Provide a userId from this tenant’s security alert.' });
      }
      if (typeof body.investigationReference !== 'string' ||
        body.investigationReference.trim().length < 3 ||
        body.investigationReference.length > 128 ||
        typeof body.investigationSummary !== 'string' ||
        body.investigationSummary.trim().length < 20 ||
        body.investigationSummary.length > 2000) {
        return json(400, {
          error: 'Provide an investigationReference (3-128 characters) and investigationSummary (20-2000 characters).',
        });
      }
      const released = await releaseUserQuarantine(
        body.userId,
        bank.tenantId,
        bank.subject,
        new Date().toISOString(),
        body.investigationReference.trim(),
        body.investigationSummary.trim(),
      );
      if (!released) return json(404, { error: 'Suspended account not found or already released.' });
      return json(200, { released: true });
    },
  ),
});

app.http('escrowPublicKey', {
  route: 'escrow/public-key',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: withErrors('escrowPublicKey', async (request) => {
    const session = await authorizedSession(request);
    if (!session) return json(401, { error: 'A valid employee session is required.' });
    return json(200, await getEscrowPublicKey(session.tenantId));
  }),
});

app.http('complianceDecrypt', {
  route: 'security/compliance/decrypt',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: withBankRole('complianceDecrypt', BANK_ROLES.compliance, async (request, _context, bank) => {
    const body = await readJson(request);
    if (
      !body ||
      !isSafeUserId(body.userId) ||
      !isSafeId(body.documentId) ||
      !isSafeId(body.caseReference) ||
      typeof body.reason !== 'string' ||
      body.reason.trim().length < 20 ||
      body.reason.trim().length > 2000
    ) {
      return json(400, {
        error: 'Provide a valid userId, documentId, caseReference, and a 20-2000 character reason.',
      });
    }

    const userId = scopeBankUserId(bank.tenantId, body.userId);
    const documentId = body.documentId;
    const stored = await getEncryptedDocument(userId, documentId);
    if (!stored) return json(404, { error: 'Encrypted document not found.' });

    let parsed: unknown;
    try {
      parsed = JSON.parse(stored) as unknown;
    } catch {
      return json(400, { error: 'Stored document is not a valid escrow envelope.' });
    }
    const envelope = parseEscrowEnvelope(parsed);
    if (!envelope) return json(400, { error: 'Stored document is not a valid escrow envelope.' });

    let plaintext: Buffer;
    try {
      plaintext = await decryptForCompliance(envelope, bank.tenantId, body.userId, documentId);
    } catch (error) {
      if (error instanceof InvalidEscrowEnvelopeError) {
        return json(400, { error: error.message });
      }
      throw error;
    }

    try {
      await recordEscrowAccess({
        tenantId: bank.tenantId,
        userId,
        documentId,
        keyId: envelope.keyId,
        occurredAt: new Date().toISOString(),
        actorId: bank.subject,
        clientId: bank.clientId,
        caseReference: body.caseReference,
        reason: body.reason.trim(),
      });
      return json(200, {
        userId,
        documentId,
        plaintextBase64Url: plaintext.toString('base64url'),
        encoding: 'base64url',
      });
    } finally {
      plaintext.fill(0);
    }
  }),
});

app.http('complianceAudit', {
  route: 'security/compliance/audit',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: withBankRole('complianceAudit', BANK_ROLES.compliance, async (_request, _context, bank) => {
    return json(200, { entries: await listEscrowAccesses(100, bank.tenantId) });
  }),
});

app.http('revokeDevice', {
  route: 'security/devices/revoke',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: withBankRole('revokeDevice', BANK_ROLES.securityAdmin, async (request, _context, bank) => {
    const body = await readJson(request);
    if (!body || !isSafeUserId(body.userId) || !isSafeId(body.deviceId)) {
      return json(400, { error: 'Provide a valid userId and deviceId.' });
    }

    const userId = scopeBankUserId(bank.tenantId, body.userId);
    const deviceId = body.deviceId;
    const device = await getDevice(userId, deviceId);
    if (!device) return json(404, { error: 'Device not found.' });
    await saveDevice({ ...device, status: 'revoked' });

    const credentials = await listCredentials(userId);
    await Promise.all(credentials
      .filter((credential) => credential.deviceId === deviceId)
      .map((credential) => saveCredential(userId, { ...credential, revoked: true })));
    return json(200, { revoked: true, deviceId });
  }),
});

app.http('listDemoDeviceActions', {
  route: 'security/devices/actions',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: withBankRole(
    'listDemoDeviceActions',
    BANK_ROLES.securityAdmin,
    async (_request, _context, bank) => {
      return json(200, {
        executionMode: 'simulation-only',
        actions: await listDeviceActions(bank.tenantId),
      });
    },
  ),
});

app.http('requestDemoDeviceAction', {
  route: 'security/devices/actions/request',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: withBankRole(
    'requestDemoDeviceAction',
    BANK_ROLES.securityAdmin,
    async (request, _context, bank) => {
      const body = await readJson(request);
      if (
        !body ||
        !isSafeUserId(body.userId) ||
        !isSafeId(body.deviceId) ||
        !isDemoDeviceAction(body.action) ||
        !isValidActionReason(body.reason)
      ) {
        return json(400, {
          error: 'Provide a valid userId, deviceId, lock or wipe action, and a 20-500 character reason.',
        });
      }

      const userId = scopeBankUserId(bank.tenantId, body.userId);
      const device = await getDevice(userId, body.deviceId);
      if (!device) return json(404, { error: 'Device not found.' });
      if (device.status !== 'active') {
        return json(409, { error: 'Only active enrolled devices can receive a simulated action request.' });
      }

      const actionId = randomUUID();
      const requestedAt = new Date().toISOString();
      await createDeviceAction({
        actionId,
        tenantId: bank.tenantId,
        userId,
        deviceId: body.deviceId,
        action: body.action,
        reason: body.reason.trim(),
        requestedBy: bank.subject,
        requestedAt,
        status: 'pending-approval',
      });
      return json(201, {
        actionId,
        status: 'pending-approval',
        executionMode: 'simulation-only',
        deviceCommandSent: false,
        message: 'A different security administrator must approve or reject this request. No device command will be sent.',
      });
    },
  ),
});

app.http('decideDemoDeviceAction', {
  route: 'security/devices/actions/decide',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: withBankRole(
    'decideDemoDeviceAction',
    BANK_ROLES.securityAdmin,
    async (request, _context, bank) => {
      const body = await readJson(request);
      if (
        !body ||
        !isSafeId(body.actionId) ||
        (body.decision !== 'approve' && body.decision !== 'reject') ||
        !isValidActionReason(body.reason)
      ) {
        return json(400, {
          error: 'Provide a valid actionId, approve or reject decision, and a 20-500 character reason.',
        });
      }

      const result = await decideDeviceAction(
        bank.tenantId,
        body.actionId,
        bank.subject,
        new Date().toISOString(),
        body.decision,
        body.reason.trim(),
      );
      if (result === 'not-found') return json(404, { error: 'Device action request not found.' });
      if (result === 'self-approval') {
        return json(403, { error: 'The requesting administrator cannot approve or reject their own action request.' });
      }
      if (result === 'already-decided' || result === 'conflict') {
        return json(409, { error: 'The action request is no longer pending; refresh the action list.' });
      }

      return json(200, {
        actionId: body.actionId,
        status: body.decision === 'approve' ? 'approved-simulation-only' : 'rejected',
        executionMode: 'simulation-only',
        deviceCommandSent: false,
      });
    },
  ),
});

app.http('recordDemoDeviceCompliance', {
  route: 'security/devices/compliance/demo',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: withBankRole(
    'recordDemoDeviceCompliance',
    BANK_ROLES.securityAdmin,
    async (request, _context, bank) => {
      const body = await readJson(request);
      if (
        !body ||
        !isSafeUserId(body.userId) ||
        !isSafeId(body.deviceId) ||
        !isDemoComplianceStatus(body.status) ||
        !isValidActionReason(body.note)
      ) {
        return json(400, {
          error: 'Provide a valid userId, deviceId, compliant/noncompliant/unknown status, and a 20-500 character note.',
        });
      }

      const userId = scopeBankUserId(bank.tenantId, body.userId);
      const device = await getDevice(userId, body.deviceId);
      if (!device) return json(404, { error: 'Device not found.' });
      const occurredAt = new Date().toISOString();
      const updatedDevice: StoredDevice = {
        ...device,
        demoComplianceStatus: body.status,
        demoComplianceAt: occurredAt,
        demoComplianceNote: body.note.trim(),
      };
      await recordDemoDeviceCompliance(updatedDevice, bank.tenantId, bank.subject, occurredAt);
      return json(200, {
        deviceId: body.deviceId,
        compliance: {
          status: body.status,
          source: 'demo-admin-input',
          authoritative: false,
          recordedAt: occurredAt,
        },
      });
    },
  ),
});

app.http('getDemoDeviceCompliance', {
  route: 'security/devices/compliance/demo',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: withBankRole(
    'getDemoDeviceCompliance',
    BANK_ROLES.securityAdmin,
    async (request, _context, bank) => {
      const employeeId = request.query.get('userId');
      const deviceId = request.query.get('deviceId');
      if (!isSafeUserId(employeeId) || !isSafeId(deviceId)) {
        return json(400, { error: 'Provide a valid userId and deviceId query parameter.' });
      }

      const device = await getDevice(scopeBankUserId(bank.tenantId, employeeId), deviceId);
      if (!device) return json(404, { error: 'Device not found.' });
      return json(200, {
        deviceId,
        compliance: {
          status: device.demoComplianceStatus ?? 'unknown',
          source: device.demoComplianceStatus ? 'demo-admin-input' : 'not-reported',
          authoritative: false,
          ...(device.demoComplianceAt ? { recordedAt: device.demoComplianceAt } : {}),
        },
      });
    },
  ),
});
