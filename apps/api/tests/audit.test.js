import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import {
  serializeAuditPayload,
  verifyAuditEvidence,
} from '../dist/audit.js';

test('audit evidence is verifiable and bound to its exact canonical payload', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicExponent: 0x10001,
  });
  const payload = serializeAuditPayload({
    action: 'account-suspended-investigation-required',
    eventId: 'event-123',
    tenantId: 'tenant-123',
  });
  const signature = sign('RSA-SHA256', Buffer.from(payload, 'utf8'), privateKey)
    .toString('base64url');
  const jwk = publicKey.export({ format: 'jwk' });
  const auditPublicKey = {
    keyId: 'https://example.vault.azure.net/keys/audit/7',
    algorithm: 'RS256',
    kty: 'RSA',
    n: jwk.n,
    e: jwk.e,
  };

  assert.equal(verifyAuditEvidence(payload, signature, auditPublicKey), true);
  assert.equal(
    verifyAuditEvidence(payload.replace('account-suspended', 'account-released'), signature, auditPublicKey),
    false,
  );
  assert.equal(
    verifyAuditEvidence('{"tenantId":"tenant-123","eventId":"event-123","action":"account-suspended-investigation-required"}',
      signature,
      auditPublicKey),
    false,
  );
});
