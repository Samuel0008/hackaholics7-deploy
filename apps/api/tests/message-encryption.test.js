import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import {
  decryptMessageWithPrivateKey,
  encryptForEmployeeAndBank,
} from '../../../packages/crypto/dist/index.js';

test('encrypts a message for the employee and escrow key holders', async () => {
  const recipientPair = await webcrypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 3072,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    false,
    ['encrypt', 'decrypt'],
  );
  const escrowPair = await webcrypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 3072,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    false,
    ['encrypt', 'decrypt'],
  );
  const [recipientJwk, escrowJwk] = await Promise.all([
    webcrypto.subtle.exportKey('jwk', recipientPair.publicKey),
    webcrypto.subtle.exportKey('jwk', escrowPair.publicKey),
  ]);
  const recipient = {
    keyId: 'employee-key-v1',
    algorithm: 'RSA-OAEP-256',
    kty: 'RSA',
    n: recipientJwk.n,
    e: recipientJwk.e,
  };
  const escrow = {
    keyId: 'https://demo.vault.azure.net/keys/bank-escrow/version-1',
    algorithm: 'RSA-OAEP-256',
    kty: 'RSA',
    n: escrowJwk.n,
    e: escrowJwk.e,
  };
  const message = new TextEncoder().encode('confidential fake test message');
  const envelope = await encryptForEmployeeAndBank(
    message,
    'demo-user',
    'message-1',
    recipient,
    escrow,
  );

  assert.equal(recipientPair.privateKey.extractable, false);
  assert.equal(escrowPair.privateKey.extractable, false);
  assert.deepEqual(
    await decryptMessageWithPrivateKey(
      envelope,
      'demo-user',
      'message-1',
      recipientPair.privateKey,
    ),
    message,
  );
  await assert.rejects(
    decryptMessageWithPrivateKey(
      envelope,
      'demo-user',
      'message-2',
      recipientPair.privateKey,
    ),
  );
  await assert.rejects(
    webcrypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      recipientPair.privateKey,
      Buffer.from(envelope.wrappedEscrowKey, 'base64url'),
    ),
  );
});
