import assert from 'node:assert/strict';
import { createCipheriv, randomBytes } from 'node:crypto';
import test from 'node:test';
import {
  decryptPayloadWithDataKey,
  InvalidEscrowEnvelopeError,
  parseEscrowEnvelope,
} from '../dist/escrow.js';

function makeEnvelope(dataKey, plaintext, userId, documentId, keyId) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', dataKey, iv);
  const recipientKeyId = 'employee-demo-key';
  cipher.setAAD(Buffer.from(
    `v1|${userId}|${documentId}|${keyId}|${recipientKeyId}`,
    'utf8',
  ));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    version: 1,
    algorithm: 'A256GCM-RSA-OAEP-256',
    keyId,
    iv: iv.toString('base64url'),
    ciphertext: Buffer.concat([ciphertext, cipher.getAuthTag()]).toString('base64url'),
    wrappedEscrowKey: randomBytes(384).toString('base64url'),
    recipientKeyId,
    wrappedRecipientKey: randomBytes(384).toString('base64url'),
  };
}

test('decrypts client ciphertext when the envelope metadata matches', () => {
  const userId = 'demo-user';
  const documentId = 'message-1';
  const keyId = 'https://demo.vault.azure.net/keys/bank-escrow/version-1';
  const dataKey = randomBytes(32);
  const plaintext = Buffer.from('fake compliance test message');
  const envelope = makeEnvelope(dataKey, plaintext, userId, documentId, keyId);
  const parsed = parseEscrowEnvelope(envelope);

  assert.ok(parsed);
  assert.deepEqual(
    decryptPayloadWithDataKey(parsed, userId, documentId, dataKey),
    plaintext,
  );
});

test('rejects ciphertext if its document binding was changed', () => {
  const dataKey = randomBytes(32);
  const envelope = makeEnvelope(
    dataKey,
    Buffer.from('fake compliance test message'),
    'demo-user',
    'message-1',
    'https://demo.vault.azure.net/keys/bank-escrow/version-1',
  );
  const parsed = parseEscrowEnvelope(envelope);

  assert.ok(parsed);
  assert.throws(
    () => decryptPayloadWithDataKey(parsed, 'demo-user', 'different-message', dataKey),
    InvalidEscrowEnvelopeError,
  );
});

test('rejects envelopes missing the employee recipient key wrap', () => {
  const envelope = {
    version: 1,
    algorithm: 'A256GCM-RSA-OAEP-256',
    keyId: 'https://demo.vault.azure.net/keys/bank-escrow/version-1',
    iv: randomBytes(12).toString('base64url'),
    ciphertext: randomBytes(32).toString('base64url'),
    wrappedEscrowKey: randomBytes(384).toString('base64url'),
    recipientKeyId: 'employee-demo-key',
  };

  assert.equal(parseEscrowEnvelope(envelope), undefined);
});
