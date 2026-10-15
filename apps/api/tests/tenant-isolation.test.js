import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BankAuthorizationError,
  isDelegatedUserClaims,
  requireBankRole,
  isScopedBankUserId,
  scopeBankUserId,
  createSessionToken,
  readSessionTokenClaims,
  verifyGatewayHeader,
} from '../dist/security.js';
import { SignJWT } from 'jose';
import { isRepeatDecoyHitWithinWindow } from '../dist/storage.js';

test('scopes the same user identifier to separate bank tenants', () => {
  const userId = 'employee-123';
  const bankA = scopeBankUserId('11111111-1111-4111-8111-111111111111', userId);
  const bankB = scopeBankUserId('22222222-2222-4222-8222-222222222222', userId);

  assert.notEqual(bankA, bankB);
  assert.match(bankA, /^11111111-1111-4111-8111-111111111111_[a-f0-9]{64}$/);
  assert.match(bankB, /^22222222-2222-4222-8222-222222222222_[a-f0-9]{64}$/);
  assert.equal(isScopedBankUserId(bankA, '11111111-1111-4111-8111-111111111111'), true);
  assert.equal(isScopedBankUserId(bankA, '22222222-2222-4222-8222-222222222222'), false);
  assert.equal(isScopedBankUserId(userId, '11111111-1111-4111-8111-111111111111'), false);
});

test('rejects protected API calls without a bearer token', async () => {
  await assert.rejects(
    requireBankRole(null, 'Bank.Employee'),
    (error) => error instanceof BankAuthorizationError && error.statusCode === 401,
  );
});

test('recognizes only delegated Entra user claims for employee identity', () => {
  const delegated = {
    oid: '11111111-1111-4111-8111-111111111111',
    scp: 'access_as_user',
  };
  assert.equal(isDelegatedUserClaims(delegated), true);
  assert.equal(isDelegatedUserClaims({ ...delegated, idtyp: 'app' }), false);
  assert.equal(isDelegatedUserClaims({ oid: delegated.oid }), false);
  assert.equal(isDelegatedUserClaims({ ...delegated, oid: 'service-principal' }), false);
  assert.equal(isDelegatedUserClaims({ ...delegated, scp: 'profile email' }), false);
  assert.equal(isDelegatedUserClaims({
    ...delegated,
    scp: 'profile access_as_user email',
  }), true);
});

test('session tokens carry a version and reject tokens without one', async () => {
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'session-version-test-signing-secret-at-least-32-bytes';
  try {
    const session = {
      userId: '11111111-1111-4111-8111-111111111111_' + 'a'.repeat(64),
      deviceId: 'test-device',
      tenantId: '11111111-1111-4111-8111-111111111111',
      sessionVersion: 3,
    };
    const token = await createSessionToken(session);
    assert.equal((await readSessionTokenClaims(token))?.sessionVersion, 3);

    const legacyToken = await new SignJWT({
      deviceId: session.deviceId,
      tenantId: session.tenantId,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(session.userId)
      .setIssuedAt()
      .setExpirationTime('1m')
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));
    assert.equal(await readSessionTokenClaims(legacyToken), undefined);
  } finally {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
});

test('escalates a second identified decoy hit within 24 hours, not after the window', () => {
  const firstHit = '2026-10-14T12:00:00.000Z';
  assert.equal(isRepeatDecoyHitWithinWindow(undefined, firstHit), false);
  assert.equal(
    isRepeatDecoyHitWithinWindow(firstHit, '2026-10-15T11:59:59.999Z'),
    true,
  );
  assert.equal(
    isRepeatDecoyHitWithinWindow(firstHit, '2026-10-15T12:00:00.000Z'),
    true,
  );
  assert.equal(
    isRepeatDecoyHitWithinWindow(firstHit, '2026-10-15T12:00:00.001Z'),
    false,
  );
  assert.throws(
    () => isRepeatDecoyHitWithinWindow('not-a-time', firstHit),
    /timestamps are invalid/u,
  );
});

test('enforces the gateway secret when configured and permits local development when unset', () => {
  const secret = 'a'.repeat(43);
  assert.equal(verifyGatewayHeader(null, undefined), true);
  assert.equal(verifyGatewayHeader(secret, secret), true);
  assert.equal(verifyGatewayHeader('wrong', secret), false);
  assert.equal(verifyGatewayHeader(null, secret), false);
  assert.throws(() => verifyGatewayHeader(null, 'too-short'));
});
