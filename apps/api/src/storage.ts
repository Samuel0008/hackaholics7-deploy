import { TableClient, type TableEntity } from '@azure/data-tables';
import { DefaultAzureCredential } from '@azure/identity';
import { randomUUID } from 'node:crypto';
import { signAuditPayload } from './escrow.js';
import type { AuditPayload } from './audit.js';
import type { DeviceActionRecord } from './device-actions.js';

const tableNames = {
  challenges: 'DemoChallenges',
  credentials: 'DemoCredentials',
  devices: 'DemoDevices',
  documents: 'DemoDocuments',
  messageKeys: 'DemoMessageKeys',
  canaries: 'DemoCanaries',
  alerts: 'DemoAlerts',
  escrowAudits: 'DemoEscrowAudits',
  userSecurity: 'DemoUserSecurity',
  deviceActions: 'DemoDeviceActions',
} as const;

const clients = new Map<keyof typeof tableNames, TableClient>();
let initialization: Promise<void> | undefined;
const decoyAlertWindowMs = 5 * 60_000;
const decoyAlertLimitPerWindow = 20;
const decoyReauthenticationWindowMs = 15 * 60_000;
const decoyEscalationWindowMs = 24 * 60 * 60_000;
let decoyAlertWindowStartedAt = 0;
let decoyAlertCount = 0;

function hasStatusCode(error: unknown, statusCode: number): boolean {
  return error instanceof Error && 'statusCode' in error && error.statusCode === statusCode;
}

function table(name: keyof typeof tableNames): TableClient {
  const existing = clients.get(name);
  if (existing) return existing;

  const connectionString = process.env.AzureWebJobsStorage;
  const endpoint = process.env.TABLES_ENDPOINT;
  if (connectionString) {
    const client = TableClient.fromConnectionString(connectionString, tableNames[name]);
    clients.set(name, client);
    return client;
  }

  if (!endpoint) {
    throw new Error('AzureWebJobsStorage or TABLES_ENDPOINT must be configured.');
  }
  const parsedEndpoint = new URL(endpoint);
  if (parsedEndpoint.protocol !== 'https:' || parsedEndpoint.pathname !== '/') {
    throw new Error('TABLES_ENDPOINT must be an HTTPS storage endpoint.');
  }
  const client = new TableClient(endpoint, tableNames[name], new DefaultAzureCredential());
  clients.set(name, client);
  return client;
}

async function initialize(): Promise<void> {
  if (!initialization) {
    initialization = Promise.all(
      (Object.keys(tableNames) as (keyof typeof tableNames)[]).map(async (name) => {
        try {
          await table(name).createTable();
        } catch (error) {
          if (!hasStatusCode(error, 409)) {
            throw error;
          }
        }
      }),
    ).then(() => undefined);
  }

  await initialization;
}

type AlertFields = Record<string, string | number | boolean | undefined> & {
  type: string;
  canaryId: string;
  occurredAt: string;
};

async function createAuditAlert(fields: AlertFields): Promise<void> {
  const eventId = randomUUID();
  const payload: AuditPayload = {};
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      payload[key] = value;
    }
  }
  payload.eventId = eventId;
  const tenantId = typeof payload.tenantId === 'string' ? payload.tenantId : undefined;
  const evidence = tenantId ? await signAuditPayload(tenantId, payload) : undefined;
  await table('alerts').createEntity({
    partitionKey: fields.occurredAt.slice(0, 10),
    rowKey: eventId,
    ...payload,
    ...(evidence ? {
      evidenceAlgorithm: 'RS256',
      evidenceKeyId: evidence.keyId,
      evidencePayload: evidence.payload,
      evidenceSignature: evidence.signature,
    } : {}),
  });
}

export interface StoredCredential {
  id: string;
  publicKey: string;
  counter: number;
  transports: string[];
  deviceId: string;
  revoked: boolean;
}

export interface StoredDevice {
  userId: string;
  deviceId: string;
  status: 'active' | 'revoked';
  createdAt: string;
  demoComplianceStatus?: 'compliant' | 'noncompliant' | 'unknown';
  demoComplianceAt?: string;
  demoComplianceNote?: string;
}

export interface DecoyAccess {
  tenantId: string;
  userId: string;
  deviceId?: string;
  decoyId: string;
  occurredAt: string;
}

export interface StoredMessageKey {
  userId: string;
  keyId: string;
  publicJwk: string;
  deviceId: string;
  createdAt: string;
}

export type IdentifiedDecoyAction =
  | 'reauthentication-required'
  | 'account-suspended'
  | 'already-suspended';

export function isRepeatDecoyHitWithinWindow(
  lastDecoyHitAt: string | undefined,
  occurredAt: string,
): boolean {
  if (!lastDecoyHitAt) return false;
  const previous = Date.parse(lastDecoyHitAt);
  const current = Date.parse(occurredAt);
  if (!Number.isFinite(previous) || !Number.isFinite(current)) {
    throw new Error('Decoy hit timestamps are invalid.');
  }
  return Math.abs(current - previous) <= decoyEscalationWindowMs;
}

type CredentialEntity = TableEntity &
  Omit<StoredCredential, 'transports'> & { transports: string };

export async function saveChallenge(
  purpose: 'registration' | 'authentication',
  userId: string,
  challenge: string,
): Promise<void> {
  await initialize();
  await table('challenges').upsertEntity({
    partitionKey: purpose,
    rowKey: userId,
    challenge,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
  }, 'Replace');
}

export async function consumeChallenge(
  purpose: 'registration' | 'authentication',
  userId: string,
  notBefore?: string,
): Promise<string | undefined> {
  await initialize();
  const client = table('challenges');
  let entity: TableEntity;
  try {
    entity = await client.getEntity(purpose, userId);
  } catch (error) {
    if (hasStatusCode(error, 404)) return undefined;
    throw error;
  }

  const challenge = entity.challenge;
  const createdAt = entity.createdAt;
  const expiresAt = entity.expiresAt;
  const etag = typeof entity.etag === 'string' ? entity.etag : undefined;
  if (typeof challenge !== 'string' || typeof expiresAt !== 'string') {
    throw new Error('Stored WebAuthn challenge has an invalid shape.');
  }

  if (Date.parse(expiresAt) <= Date.now()) {
    await client.deleteEntity(purpose, userId, { etag });
    return undefined;
  }

  await client.deleteEntity(purpose, userId, { etag });
  if (notBefore !== undefined) {
    const createdAtTime = typeof createdAt === 'string' ? Date.parse(createdAt) : Number.NaN;
    if (!Number.isFinite(createdAtTime)) {
      throw new Error('Stored WebAuthn challenge has an invalid creation time.');
    }
    if (createdAtTime <= Date.parse(notBefore)) return undefined;
  }
  return challenge;
}

export async function listCredentials(userId: string): Promise<StoredCredential[]> {
  await initialize();
  const results: StoredCredential[] = [];
  for await (const entity of table('credentials').listEntities<CredentialEntity>({
    queryOptions: { filter: `PartitionKey eq 'user:${userId}'` },
  })) {
    results.push({
      id: entity.id,
      publicKey: entity.publicKey,
      counter: entity.counter,
      transports: JSON.parse(entity.transports) as string[],
      deviceId: entity.deviceId,
      revoked: entity.revoked,
    });
  }
  return results;
}

export async function getCredential(
  userId: string,
  credentialId: string,
): Promise<StoredCredential | undefined> {
  await initialize();
  try {
    const entity = await table('credentials').getEntity<CredentialEntity>(
      `user:${userId}`,
      credentialId,
    );
    return {
      id: entity.id,
      publicKey: entity.publicKey,
      counter: entity.counter,
      transports: JSON.parse(entity.transports) as string[],
      deviceId: entity.deviceId,
      revoked: entity.revoked,
    };
  } catch (error) {
    if (hasStatusCode(error, 404)) return undefined;
    throw error;
  }
}

export async function saveCredential(
  userId: string,
  credential: StoredCredential,
): Promise<void> {
  await initialize();
  await table('credentials').upsertEntity({
    partitionKey: `user:${userId}`,
    rowKey: credential.id,
    id: credential.id,
    publicKey: credential.publicKey,
    counter: credential.counter,
    transports: JSON.stringify(credential.transports),
    deviceId: credential.deviceId,
    revoked: credential.revoked,
  }, 'Replace');
}

export async function saveDevice(device: StoredDevice): Promise<void> {
  await initialize();
  await table('devices').upsertEntity({
    partitionKey: device.userId,
    rowKey: device.deviceId,
    userId: device.userId,
    deviceId: device.deviceId,
    status: device.status,
    createdAt: device.createdAt,
    ...(device.demoComplianceStatus
      ? { demoComplianceStatus: device.demoComplianceStatus }
      : {}),
    ...(device.demoComplianceAt ? { demoComplianceAt: device.demoComplianceAt } : {}),
    ...(device.demoComplianceNote ? { demoComplianceNote: device.demoComplianceNote } : {}),
  }, 'Replace');
}

export async function recordDemoDeviceCompliance(
  device: StoredDevice,
  tenantId: string,
  reportedBy: string,
  occurredAt: string,
): Promise<void> {
  await saveDevice(device);
  await createAuditAlert({
    type: 'demo-device-compliance-recorded',
    canaryId: device.deviceId,
    occurredAt,
    tenantId,
    userId: device.userId,
    deviceId: device.deviceId,
    complianceStatus: device.demoComplianceStatus ?? 'unknown',
    complianceSource: 'demo-admin-input',
    authoritative: false,
    reportedBy,
    note: device.demoComplianceNote ?? '',
    severity: 'audit',
  });
}

export async function getDevice(
  userId: string,
  deviceId: string,
): Promise<StoredDevice | undefined> {
  await initialize();
  try {
    return await table('devices').getEntity<TableEntity & StoredDevice>(userId, deviceId);
  } catch (error) {
    if (hasStatusCode(error, 404)) return undefined;
    throw error;
  }
}

export async function createDeviceAction(action: DeviceActionRecord): Promise<void> {
  await initialize();
  await table('deviceActions').createEntity({
    partitionKey: action.tenantId,
    rowKey: action.actionId,
    ...action,
  });
  await createAuditAlert({
    type: 'demo-device-action-requested',
    canaryId: action.actionId,
    occurredAt: action.requestedAt,
    tenantId: action.tenantId,
    userId: action.userId,
    deviceId: action.deviceId,
    action: action.action,
    status: action.status,
    requestedBy: action.requestedBy,
    reason: action.reason,
    executionMode: 'simulation-only',
    deviceCommandSent: false,
    severity: 'audit',
  });
}

export async function listDeviceActions(
  tenantId: string,
  limit = 100,
): Promise<DeviceActionRecord[]> {
  await initialize();
  const actions: DeviceActionRecord[] = [];
  for await (const entity of table('deviceActions').listEntities<
    TableEntity & DeviceActionRecord
  >({
    queryOptions: {
      filter: `PartitionKey eq '${tenantId}'`,
      select: [
        'actionId',
        'tenantId',
        'userId',
        'deviceId',
        'action',
        'reason',
        'requestedBy',
        'requestedAt',
        'status',
        'decidedBy',
        'decidedAt',
        'decisionReason',
      ],
    },
  })) {
    if (entity.tenantId !== tenantId) continue;
    actions.push({
      actionId: entity.actionId,
      tenantId: entity.tenantId,
      userId: entity.userId,
      deviceId: entity.deviceId,
      action: entity.action,
      reason: entity.reason,
      requestedBy: entity.requestedBy,
      requestedAt: entity.requestedAt,
      status: entity.status,
      ...(typeof entity.decidedBy === 'string' ? { decidedBy: entity.decidedBy } : {}),
      ...(typeof entity.decidedAt === 'string' ? { decidedAt: entity.decidedAt } : {}),
      ...(typeof entity.decisionReason === 'string'
        ? { decisionReason: entity.decisionReason }
        : {}),
    });
    if (actions.length >= limit) break;
  }
  return actions.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
}

export async function decideDeviceAction(
  tenantId: string,
  actionId: string,
  decidedBy: string,
  decidedAt: string,
  decision: 'approve' | 'reject',
  decisionReason?: string,
): Promise<'decided' | 'not-found' | 'already-decided' | 'self-approval' | 'conflict'> {
  await initialize();
  const client = table('deviceActions');
  let entity: TableEntity & DeviceActionRecord;
  try {
    entity = await client.getEntity<TableEntity & DeviceActionRecord>(
      tenantId,
      actionId,
    );
  } catch (error) {
    if (hasStatusCode(error, 404)) return 'not-found';
    throw error;
  }
  if (entity.tenantId !== tenantId) return 'not-found';
  if (entity.status !== 'pending-approval') return 'already-decided';
  if (entity.requestedBy === decidedBy) return 'self-approval';
  if (typeof entity.etag !== 'string') {
    throw new Error('Stored device action is missing its concurrency token.');
  }

  const status = decision === 'approve'
    ? 'approved-simulation-only'
    : 'rejected';
  try {
    await client.updateEntity({
      partitionKey: tenantId,
      rowKey: actionId,
      tenantId,
      actionId,
      status,
      decidedBy,
      decidedAt,
      ...(decisionReason ? { decisionReason } : {}),
    }, 'Merge', { etag: entity.etag });
  } catch (error) {
    if (hasStatusCode(error, 412)) return 'conflict';
    throw error;
  }

  await createAuditAlert({
    type: decision === 'approve'
      ? 'demo-device-action-approved'
      : 'demo-device-action-rejected',
    canaryId: actionId,
    occurredAt: decidedAt,
    tenantId,
    userId: entity.userId,
    deviceId: entity.deviceId,
    action: entity.action,
    status,
    requestedBy: entity.requestedBy,
    decidedBy,
    ...(decisionReason ? { decisionReason } : {}),
    executionMode: 'simulation-only',
    deviceCommandSent: false,
    severity: 'audit',
  });
  return 'decided';
}

export async function isUserQuarantined(userId: string): Promise<boolean> {
  await initialize();
  try {
    const entity = await table('userSecurity').getEntity<TableEntity & { status: string }>(
      'user',
      userId,
    );
    return entity.status === 'quarantined';
  } catch (error) {
    if (hasStatusCode(error, 404)) return false;
    throw error;
  }
}

export async function getUserReauthenticationRequiredAt(
  userId: string,
  now = Date.now(),
): Promise<string | undefined> {
  await initialize();
  try {
    const entity = await table('userSecurity').getEntity<
      TableEntity & { status: string; reauthenticationRequiredAt?: string; reauthenticationUntil?: string }
    >('user', userId);
    if (entity.status !== 'reauthentication-required') return undefined;
    if (typeof entity.reauthenticationRequiredAt !== 'string' ||
      typeof entity.reauthenticationUntil !== 'string' ||
      !Number.isFinite(Date.parse(entity.reauthenticationRequiredAt)) ||
      !Number.isFinite(Date.parse(entity.reauthenticationUntil))) {
      throw new Error('Stored reauthentication state has an invalid shape.');
    }
    return Date.parse(entity.reauthenticationUntil) > now
      ? entity.reauthenticationRequiredAt
      : undefined;
  } catch (error) {
    if (hasStatusCode(error, 404)) return undefined;
    throw error;
  }
}

export async function isUserReauthenticationRequired(userId: string): Promise<boolean> {
  return (await getUserReauthenticationRequiredAt(userId)) !== undefined;
}

export async function getUserSessionVersion(userId: string): Promise<number> {
  await initialize();
  try {
    const entity = await table('userSecurity').getEntity<
      TableEntity & { sessionVersion?: number }
    >('user', userId);
    const version = entity.sessionVersion ?? 0;
    if (!Number.isSafeInteger(version) || version < 0) {
      throw new Error('Stored user session version is invalid.');
    }
    return version;
  } catch (error) {
    if (hasStatusCode(error, 404)) return 0;
    throw error;
  }
}

export async function clearUserReauthentication(
  userId: string,
  tenantId: string,
  expectedRequiredAt?: string,
  occurredAt = new Date().toISOString(),
): Promise<boolean> {
  await initialize();
  const client = table('userSecurity');
  let entity: TableEntity;
  try {
    entity = await client.getEntity('user', userId);
  } catch (error) {
    if (hasStatusCode(error, 404)) return expectedRequiredAt === undefined;
    throw error;
  }
  if (entity.tenantId !== tenantId || entity.status === 'quarantined') return false;
  if (entity.status !== 'reauthentication-required') return entity.status === 'active';
  if (typeof entity.etag !== 'string') {
    throw new Error('Stored reauthentication state is missing its concurrency token.');
  }
  if (expectedRequiredAt !== undefined &&
    entity.reauthenticationRequiredAt !== expectedRequiredAt) return false;
  if (expectedRequiredAt === undefined &&
    typeof entity.reauthenticationUntil === 'string' &&
    Date.parse(entity.reauthenticationUntil) > Date.now()) return false;

  try {
    await client.updateEntity({
      partitionKey: 'user',
      rowKey: userId,
      userId,
      tenantId,
      status: 'active',
      reauthenticatedAt: occurredAt,
    }, 'Merge', { etag: entity.etag });
    return true;
  } catch (error) {
    if (hasStatusCode(error, 412)) return false;
    throw error;
  }
}

export async function requireUserReauthentication(
  userId: string,
  tenantId: string,
  decoyId: string,
  occurredAt: string,
  deviceId?: string,
): Promise<IdentifiedDecoyAction> {
  await initialize();
  const client = table('userSecurity');
  let responseAction: Exclude<IdentifiedDecoyAction, 'already-suspended'> | undefined;
  for (let attempt = 0; attempt < 5; attempt++) {
    let existing: (TableEntity & {
      tenantId?: unknown;
      status?: unknown;
      sessionVersion?: number;
      lastDecoyHitAt?: unknown;
    }) | undefined;
    try {
      existing = await client.getEntity<TableEntity & {
        tenantId?: unknown;
        status?: unknown;
        sessionVersion?: number;
        lastDecoyHitAt?: unknown;
      }>('user', userId);
    } catch (error) {
      if (!hasStatusCode(error, 404)) throw error;
    }
    if (existing?.tenantId !== undefined && existing.tenantId !== tenantId) {
      throw new Error('Stored user security record has a different tenant ID.');
    }
    if (existing?.status === 'quarantined') return 'already-suspended';

    const lastDecoyHitAt = typeof existing?.lastDecoyHitAt === 'string' &&
      existing.lastDecoyHitAt.length > 0
      ? existing.lastDecoyHitAt
      : undefined;
    const suspend = isRepeatDecoyHitWithinWindow(lastDecoyHitAt, occurredAt);
    const previousSessionVersion = existing?.sessionVersion ?? 0;
    if (!Number.isSafeInteger(previousSessionVersion) || previousSessionVersion < 0) {
      throw new Error('Stored user session version is invalid.');
    }

    const securityState = {
      partitionKey: 'user',
      rowKey: userId,
      userId,
      tenantId,
      status: suspend ? 'quarantined' : 'reauthentication-required',
      reason: suspend
        ? 'repeated-verified-decoy-access'
        : 'verified-decoy-access',
      decoyId,
      deviceId: deviceId ?? '',
      sessionVersion: previousSessionVersion + 1,
      lastDecoyHitAt: !lastDecoyHitAt || Date.parse(occurredAt) >= Date.parse(lastDecoyHitAt)
        ? occurredAt
        : lastDecoyHitAt,
      ...(suspend ? {
        suspendedAt: occurredAt,
      } : {
        reauthenticationRequiredAt: occurredAt,
        reauthenticationUntil: new Date(
          Date.parse(occurredAt) + decoyReauthenticationWindowMs,
        ).toISOString(),
      }),
    };
    try {
      if (existing && typeof existing.etag === 'string') {
        await client.updateEntity(securityState, 'Merge', { etag: existing.etag });
      } else {
        await client.createEntity(securityState);
      }
      responseAction = suspend ? 'account-suspended' : 'reauthentication-required';
      break;
    } catch (error) {
      if (hasStatusCode(error, 409) || hasStatusCode(error, 412)) continue;
      throw error;
    }
  }
  if (!responseAction) {
    throw new Error('Could not update user security state after concurrent decoy access.');
  }

  await createAuditAlert({
    type: 'identified-decoy-access',
    canaryId: decoyId,
    occurredAt,
    tenantId,
    userId,
    deviceId: deviceId ?? '',
    severity: responseAction === 'account-suspended' ? 'critical' : 'high',
    action: responseAction === 'account-suspended'
      ? 'account-suspended-investigation-required'
      : 'sessions-revoked-passkey-reauth-required',
  });
  return responseAction;
}

export async function releaseUserQuarantine(
  userId: string,
  tenantId: string,
  reviewedBy: string,
  occurredAt: string,
  investigationReference: string,
  investigationSummary: string,
): Promise<boolean> {
  await initialize();
  const client = table('userSecurity');
  let entity: TableEntity;
  try {
    entity = await client.getEntity('user', userId);
  } catch (error) {
    if (hasStatusCode(error, 404)) return false;
    throw error;
  }
  if (entity.tenantId !== tenantId || entity.status !== 'quarantined') return false;
  if (typeof entity.etag !== 'string') {
    throw new Error('Suspended account is missing its concurrency token.');
  }
  try {
    await client.updateEntity({
    partitionKey: 'user',
    rowKey: userId,
    userId,
    tenantId,
    status: 'active',
    lastDecoyHitAt: '',
    reviewedBy,
    reviewedAt: occurredAt,
    investigationReference,
    investigationSummary,
    }, 'Merge', { etag: entity.etag });
  } catch (error) {
    if (hasStatusCode(error, 412)) return false;
    throw error;
  }
  await createAuditAlert({
    type: 'decoy-quarantine-released',
    canaryId: 'account-review',
    occurredAt,
    tenantId,
    userId,
    reviewedBy,
    investigationReference,
    investigationSummary,
    severity: 'audit',
    action: 'account-released',
  });
  return true;
}

export async function saveMessagePublicKey(key: StoredMessageKey): Promise<void> {
  await initialize();
  await table('messageKeys').upsertEntity({
    partitionKey: `user:${key.userId}`,
    rowKey: key.keyId,
    userId: key.userId,
    keyId: key.keyId,
    publicJwk: key.publicJwk,
    deviceId: key.deviceId,
    createdAt: key.createdAt,
  }, 'Replace');
}

export async function listMessagePublicKeys(userId: string): Promise<StoredMessageKey[]> {
  await initialize();
  const results: StoredMessageKey[] = [];
  for await (const entity of table('messageKeys').listEntities<TableEntity & StoredMessageKey>({
    queryOptions: { filter: `PartitionKey eq 'user:${userId}'` },
  })) {
    if (
      typeof entity.userId === 'string' &&
      typeof entity.keyId === 'string' &&
      typeof entity.publicJwk === 'string' &&
      typeof entity.deviceId === 'string' &&
      typeof entity.createdAt === 'string'
    ) {
      results.push({
        userId: entity.userId,
        keyId: entity.keyId,
        publicJwk: entity.publicJwk,
        deviceId: entity.deviceId,
        createdAt: entity.createdAt,
      });
    }
  }
  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveEncryptedDocument(
  userId: string,
  documentId: string,
  encryptedEnvelope: string,
): Promise<void> {
  await initialize();
  await table('documents').upsertEntity({
    partitionKey: `user:${userId}`,
    rowKey: documentId,
    encryptedEnvelope,
    updatedAt: new Date().toISOString(),
  }, 'Replace');
}

export async function getEncryptedDocument(
  userId: string,
  documentId: string,
): Promise<string | undefined> {
  await initialize();
  try {
    const entity = await table('documents').getEntity<
      TableEntity & { encryptedEnvelope: string }
    >(`user:${userId}`, documentId);
    return entity.encryptedEnvelope;
  } catch (error) {
    if (hasStatusCode(error, 404)) return undefined;
    throw error;
  }
}

export async function createCanary(tenantId: string): Promise<string> {
  await initialize();
  const token = randomUUID().replaceAll('-', '');
  const createdAt = new Date();
  await table('canaries').createEntity({
    partitionKey: `active:${tenantId}`,
    rowKey: token,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + 24 * 60 * 60_000).toISOString(),
  });
  return token;
}

export async function recordCanaryAccess(tenantId: string, token: string): Promise<boolean> {
  await initialize();
  const client = table('canaries');
  let entity: TableEntity;
  try {
    entity = await client.getEntity(`active:${tenantId}`, token);
  } catch (error) {
    if (hasStatusCode(error, 404)) return false;
    throw error;
  }

  if (typeof entity.expiresAt === 'string' && Date.parse(entity.expiresAt) <= Date.now()) {
    await client.deleteEntity(`active:${tenantId}`, token);
    return false;
  }

  if (typeof entity.etag !== 'string') {
    throw new Error('Stored canary is missing its concurrency token.');
  }
  try {
    await client.deleteEntity(`active:${tenantId}`, token, { etag: entity.etag });
  } catch (error) {
    if (hasStatusCode(error, 404) || hasStatusCode(error, 412)) return false;
    throw error;
  }

  await createAuditAlert({
    type: 'canary-access',
    canaryId: token,
    occurredAt: new Date().toISOString(),
    tenantId,
  });
  return true;
}

export async function recordPublicDecoyAccess(
  decoyId: string,
  occurredAt = new Date().toISOString(),
  tenantId?: string,
): Promise<boolean> {
  const now = Date.now();
  if (now - decoyAlertWindowStartedAt >= decoyAlertWindowMs) {
    decoyAlertWindowStartedAt = now;
    decoyAlertCount = 0;
  }
  if (decoyAlertCount >= decoyAlertLimitPerWindow) return false;

  decoyAlertCount++;
  try {
    await initialize();
    await createAuditAlert({
      type: 'public-decoy-access',
      canaryId: decoyId,
      occurredAt,
      ...(tenantId ? { tenantId } : {}),
    });
    return true;
  } catch (error) {
    decoyAlertCount--;
    throw error;
  }
}

export async function recordIdentifiedDecoyAccess(
  access: DecoyAccess,
): Promise<IdentifiedDecoyAction> {
  return requireUserReauthentication(
    access.userId,
    access.tenantId,
    access.decoyId,
    access.occurredAt,
    access.deviceId,
  );
}

export async function listCanaryAlerts(limit: number, tenantId: string): Promise<{
  type: string;
  canaryId: string;
  occurredAt: string;
  userId?: string;
  deviceId?: string;
  severity?: string;
  action?: string;
  investigationReference?: string;
  investigationSummary?: string;
  eventId?: string;
  evidence?: {
    algorithm: 'RS256';
    keyId: string;
    payload: string;
    signature: string;
  };
}[]> {
  await initialize();
  const alerts: {
    type: string;
    canaryId: string;
    occurredAt: string;
    userId?: string;
    deviceId?: string;
    severity?: string;
    action?: string;
    investigationReference?: string;
    investigationSummary?: string;
    eventId?: string;
    evidence?: {
      algorithm: 'RS256';
      keyId: string;
      payload: string;
      signature: string;
    };
  }[] = [];
  for await (const entity of table('alerts').listEntities<
    TableEntity & { type: string; canaryId: string; occurredAt: string; tenantId: string }
  >({
    queryOptions: { filter: `tenantId eq '${tenantId}'` },
  })) {
    if (entity.tenantId !== tenantId) continue;
    alerts.push({
      type: entity.type,
      canaryId: entity.canaryId,
      occurredAt: entity.occurredAt,
      ...(typeof entity.userId === 'string' ? { userId: entity.userId } : {}),
      ...(typeof entity.deviceId === 'string' && entity.deviceId
        ? { deviceId: entity.deviceId }
        : {}),
      ...(typeof entity.severity === 'string' ? { severity: entity.severity } : {}),
      ...(typeof entity.action === 'string' ? { action: entity.action } : {}),
      ...(typeof entity.investigationReference === 'string'
        ? { investigationReference: entity.investigationReference }
        : {}),
      ...(typeof entity.investigationSummary === 'string'
        ? { investigationSummary: entity.investigationSummary }
        : {}),
      ...(typeof entity.eventId === 'string' ? { eventId: entity.eventId } : {}),
      ...(entity.evidenceAlgorithm === 'RS256' &&
        typeof entity.evidenceKeyId === 'string' &&
        typeof entity.evidencePayload === 'string' &&
        typeof entity.evidenceSignature === 'string'
        ? {
          evidence: {
            algorithm: 'RS256' as const,
            keyId: entity.evidenceKeyId,
            payload: entity.evidencePayload,
            signature: entity.evidenceSignature,
          },
        }
        : {}),
    });
  }
  return alerts.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, limit);
}

export interface EscrowAuditEntry {
  tenantId: string;
  userId: string;
  documentId: string;
  keyId: string;
  occurredAt: string;
  actorId?: string;
  clientId?: string;
  caseReference?: string;
  reason?: string;
}

export async function recordEscrowAccess(entry: EscrowAuditEntry): Promise<void> {
  await initialize();
  await table('escrowAudits').createEntity({
    partitionKey: entry.occurredAt.slice(0, 10),
    rowKey: randomUUID(),
    tenantId: entry.tenantId,
    userId: entry.userId,
    documentId: entry.documentId,
    keyId: entry.keyId,
    occurredAt: entry.occurredAt,
    ...(entry.actorId ? { actorId: entry.actorId } : {}),
    ...(entry.clientId ? { clientId: entry.clientId } : {}),
    ...(entry.caseReference ? { caseReference: entry.caseReference } : {}),
    ...(entry.reason ? { reason: entry.reason } : {}),
  });
  await createAuditAlert({
    type: 'compliance-decryption',
    canaryId: entry.documentId,
    occurredAt: entry.occurredAt,
    tenantId: entry.tenantId,
    userId: entry.userId,
    ...(entry.actorId ? { actorId: entry.actorId } : {}),
    ...(entry.clientId ? { clientId: entry.clientId } : {}),
    ...(entry.caseReference ? { caseReference: entry.caseReference } : {}),
    ...(entry.reason ? { reason: entry.reason } : {}),
    keyId: entry.keyId,
    severity: 'high',
    action: 'escrow-document-decrypted',
  });
}

export async function listEscrowAccesses(limit: number, tenantId: string): Promise<EscrowAuditEntry[]> {
  await initialize();
  const earliestDay = new Date(Date.now() - 30 * 24 * 60 * 60_000)
    .toISOString()
    .slice(0, 10);
  const results: EscrowAuditEntry[] = [];
  for await (const entity of table('escrowAudits').listEntities<
    TableEntity & EscrowAuditEntry
  >({
    queryOptions: { filter: `PartitionKey ge '${earliestDay}' and tenantId eq '${tenantId}'` },
  })) {
    if (
      entity.tenantId === tenantId &&
      typeof entity.userId === 'string' &&
      typeof entity.documentId === 'string' &&
      typeof entity.keyId === 'string' &&
      typeof entity.occurredAt === 'string'
    ) {
      results.push({
        tenantId: entity.tenantId,
        userId: entity.userId,
        documentId: entity.documentId,
        keyId: entity.keyId,
        occurredAt: entity.occurredAt,
        ...(typeof entity.actorId === 'string' ? { actorId: entity.actorId } : {}),
        ...(typeof entity.clientId === 'string' ? { clientId: entity.clientId } : {}),
        ...(typeof entity.caseReference === 'string'
          ? { caseReference: entity.caseReference }
          : {}),
        ...(typeof entity.reason === 'string' ? { reason: entity.reason } : {}),
      });
    }
  }
  return results.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, limit);
}
