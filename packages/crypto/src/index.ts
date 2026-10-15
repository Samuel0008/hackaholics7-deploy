export interface MessagePublicKey {
  keyId: string;
  algorithm: 'RSA-OAEP-256';
  kty: 'RSA';
  n: string;
  e: string;
}

export interface EscrowPublicKey {
  keyId: string;
  algorithm: 'RSA-OAEP-256';
  kty: 'RSA';
  n: string;
  e: string;
}

export interface EncryptedMessageEnvelope {
  version: 1;
  algorithm: 'A256GCM-RSA-OAEP-256';
  keyId: string;
  iv: string;
  ciphertext: string;
  wrappedEscrowKey: string;
  recipientKeyId: string;
  wrappedRecipientKey: string;
}

interface StoredPrivateKey {
  keyId: string;
  privateKey: CryptoKey;
  createdAt: string;
}

const databaseName = 'banking-attestation-message-keys';
const keyStoreName = 'privateKeys';

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error('Envelope field must use base64url encoding.');
  }
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(normalized + '='.repeat((4 - (normalized.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function messageAdditionalData(
  userId: string,
  documentId: string,
  escrowKeyId: string,
  recipientKeyId: string,
): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(
    `v1|${userId}|${documentId}|${escrowKeyId}|${recipientKeyId}`,
  );
}

function rsaJwk(key: Pick<MessagePublicKey, 'n' | 'e'>): JsonWebKey {
  return {
    kty: 'RSA',
    n: key.n,
    e: key.e,
    alg: 'RSA-OAEP-256',
    ext: true,
    key_ops: ['encrypt'],
  };
}

function openKeyDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    throw new Error('This browser does not support IndexedDB for private-key storage.');
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(keyStoreName)) {
        request.result.createObjectStore(keyStoreName, { keyPath: 'keyId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open key storage.'));
  });
}

async function storePrivateKey(record: StoredPrivateKey): Promise<void> {
  const database = await openKeyDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(keyStoreName, 'readwrite');
      transaction.objectStore(keyStoreName).put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not store key.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Key storage was aborted.'));
    });
  } finally {
    database.close();
  }
}

async function loadPrivateKey(keyId: string): Promise<CryptoKey> {
  const database = await openKeyDatabase();
  try {
    return await new Promise<CryptoKey>((resolve, reject) => {
      const request = database.transaction(keyStoreName, 'readonly')
        .objectStore(keyStoreName)
        .get(keyId);
      request.onsuccess = () => {
        const record = request.result as StoredPrivateKey | undefined;
        if (!record || record.privateKey.type !== 'private' || record.privateKey.extractable) {
          reject(new Error('No non-extractable private key is stored for this recipient.'));
          return;
        }
        resolve(record.privateKey);
      };
      request.onerror = () => reject(request.error ?? new Error('Could not read key storage.'));
    });
  } finally {
    database.close();
  }
}

export async function registerDeviceEncryptionKey(
  apiBaseUrl: string,
  sessionToken: string,
): Promise<MessagePublicKey> {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 3072,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    false,
    ['encrypt', 'decrypt'],
  );
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  if (!publicJwk.n || !publicJwk.e || pair.privateKey.extractable) {
    throw new Error('Browser did not produce an exportable public and non-extractable private key.');
  }

  const response = await fetch(new URL('/api/keys/message', apiBaseUrl), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${sessionToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      publicJwk: { kty: publicJwk.kty, n: publicJwk.n, e: publicJwk.e, alg: 'RSA-OAEP-256' },
    }),
  });
  if (!response.ok) {
    throw new Error(`Message-key registration failed with HTTP ${response.status}.`);
  }

  const result = await response.json() as { keyId?: unknown; publicKey?: unknown };
  if (
    typeof result.keyId !== 'string' ||
    !result.publicKey ||
    typeof result.publicKey !== 'object'
  ) {
    throw new Error('Message-key registration returned an invalid response.');
  }

  await storePrivateKey({
    keyId: result.keyId,
    privateKey: pair.privateKey,
    createdAt: new Date().toISOString(),
  });

  const registeredKey = result.publicKey as Record<string, unknown>;
  if (
    registeredKey.keyId !== result.keyId ||
    registeredKey.kty !== 'RSA' ||
    registeredKey.algorithm !== 'RSA-OAEP-256' ||
    typeof registeredKey.n !== 'string' ||
    typeof registeredKey.e !== 'string'
  ) {
    throw new Error('Registered public key response is invalid.');
  }

  return {
    keyId: result.keyId,
    algorithm: 'RSA-OAEP-256',
    kty: 'RSA',
    n: registeredKey.n,
    e: registeredKey.e,
  };
}

export async function encryptForEmployeeAndBank(
  plaintext: Uint8Array<ArrayBuffer>,
  userId: string,
  documentId: string,
  recipient: MessagePublicKey,
  escrow: EscrowPublicKey,
): Promise<EncryptedMessageEnvelope> {
  if (recipient.algorithm !== 'RSA-OAEP-256' || escrow.algorithm !== 'RSA-OAEP-256') {
    throw new Error('Recipient and escrow keys must use RSA-OAEP-256.');
  }

  const dataKeyBytes = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  try {
    const dataKey = await crypto.subtle.importKey(
      'raw',
      dataKeyBytes,
      { name: 'AES-GCM' },
      true,
      ['encrypt'],
    );
    const additionalData = messageAdditionalData(
      userId,
      documentId,
      escrow.keyId,
      recipient.keyId,
    );
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData, tagLength: 128 },
      dataKey,
      plaintext,
    );
    const rawDataKey = await crypto.subtle.exportKey('raw', dataKey);
    try {
      const [recipientKey, escrowKey] = await Promise.all([
        crypto.subtle.importKey('jwk', rsaJwk(recipient), {
          name: 'RSA-OAEP',
          hash: 'SHA-256',
        }, false, ['encrypt']),
        crypto.subtle.importKey('jwk', rsaJwk(escrow), {
          name: 'RSA-OAEP',
          hash: 'SHA-256',
        }, false, ['encrypt']),
      ]);
      const [wrappedRecipientKey, wrappedEscrowKey] = await Promise.all([
        crypto.subtle.encrypt({ name: 'RSA-OAEP' }, recipientKey, rawDataKey),
        crypto.subtle.encrypt({ name: 'RSA-OAEP' }, escrowKey, rawDataKey),
      ]);
      return {
        version: 1,
        algorithm: 'A256GCM-RSA-OAEP-256',
        keyId: escrow.keyId,
        iv: encodeBase64Url(iv),
        ciphertext: encodeBase64Url(new Uint8Array(ciphertext)),
        wrappedEscrowKey: encodeBase64Url(new Uint8Array(wrappedEscrowKey)),
        recipientKeyId: recipient.keyId,
        wrappedRecipientKey: encodeBase64Url(new Uint8Array(wrappedRecipientKey)),
      };
    } finally {
      new Uint8Array(rawDataKey).fill(0);
    }
  } finally {
    dataKeyBytes.fill(0);
  }
}

export async function getRecipientMessageKeys(
  apiBaseUrl: string,
  sessionToken: string,
  userId: string,
): Promise<MessagePublicKey[]> {
  const response = await fetch(
    new URL(`/api/keys/message/${encodeURIComponent(userId)}`, apiBaseUrl),
    { headers: { authorization: `Bearer ${sessionToken}` } },
  );
  if (!response.ok) {
    throw new Error(`Recipient key lookup failed with HTTP ${response.status}.`);
  }
  const result = await response.json() as { keys?: unknown };
  if (!Array.isArray(result.keys)) throw new Error('Recipient key list is invalid.');
  return result.keys.map((value): MessagePublicKey => {
    if (!value || typeof value !== 'object') throw new Error('Recipient key is invalid.');
    const key = value as Record<string, unknown>;
    if (
      typeof key.keyId !== 'string' ||
      key.algorithm !== 'RSA-OAEP-256' ||
      key.kty !== 'RSA' ||
      typeof key.n !== 'string' ||
      typeof key.e !== 'string'
    ) {
      throw new Error('Recipient key is invalid.');
    }
    return {
      keyId: key.keyId,
      algorithm: 'RSA-OAEP-256',
      kty: 'RSA',
      n: key.n,
      e: key.e,
    };
  });
}

export async function sendEncryptedMessage(
  apiBaseUrl: string,
  sessionToken: string,
  userId: string,
  documentId: string,
  plaintext: Uint8Array<ArrayBuffer>,
  recipient: MessagePublicKey,
): Promise<EncryptedMessageEnvelope> {
  const escrowResponse = await fetch(new URL('/api/escrow/public-key', apiBaseUrl), {
    headers: { authorization: `Bearer ${sessionToken}` },
  });
  if (!escrowResponse.ok) {
    throw new Error(`Escrow public-key lookup failed with HTTP ${escrowResponse.status}.`);
  }
  const escrow = await escrowResponse.json() as EscrowPublicKey;
  if (
    escrow.algorithm !== 'RSA-OAEP-256' ||
    escrow.kty !== 'RSA' ||
    typeof escrow.keyId !== 'string' ||
    typeof escrow.n !== 'string' ||
    typeof escrow.e !== 'string'
  ) {
    throw new Error('Escrow public-key response is invalid.');
  }

  const envelope = await encryptForEmployeeAndBank(
    plaintext,
    userId,
    documentId,
    recipient,
    escrow,
  );
  const response = await fetch(
    new URL(`/api/sync/${encodeURIComponent(documentId)}`, apiBaseUrl),
    {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${sessionToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ encryptedEnvelope: JSON.stringify(envelope) }),
    },
  );
  if (!response.ok) {
    throw new Error(`Encrypted message upload failed with HTTP ${response.status}.`);
  }
  return envelope;
}

export async function fetchEncryptedMessage(
  apiBaseUrl: string,
  sessionToken: string,
  documentId: string,
): Promise<EncryptedMessageEnvelope> {
  const response = await fetch(
    new URL(`/api/sync/${encodeURIComponent(documentId)}`, apiBaseUrl),
    { headers: { authorization: `Bearer ${sessionToken}` } },
  );
  if (!response.ok) {
    throw new Error(`Encrypted message download failed with HTTP ${response.status}.`);
  }
  const result = await response.json() as { encryptedEnvelope?: unknown };
  if (typeof result.encryptedEnvelope !== 'string') {
    throw new Error('Stored encrypted message is invalid.');
  }

  let value: unknown;
  try {
    value = JSON.parse(result.encryptedEnvelope) as unknown;
  } catch {
    throw new Error('Stored encrypted message is not valid JSON.');
  }
  if (!value || typeof value !== 'object') throw new Error('Stored encrypted message is invalid.');
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
    throw new Error('Stored encrypted message has an invalid envelope.');
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

export async function decryptForEmployee(
  envelope: EncryptedMessageEnvelope,
  userId: string,
  documentId: string,
): Promise<Uint8Array<ArrayBuffer>> {
  return decryptMessageWithPrivateKey(
    envelope,
    userId,
    documentId,
    await loadPrivateKey(envelope.recipientKeyId),
  );
}


export async function decryptMessageWithPrivateKey(
  envelope: EncryptedMessageEnvelope,
  userId: string,
  documentId: string,
  privateKey: CryptoKey,
): Promise<Uint8Array<ArrayBuffer>> {
  if (envelope.version !== 1 || envelope.algorithm !== 'A256GCM-RSA-OAEP-256') {
    throw new Error('Unsupported encrypted-message envelope.');
  }

  const rawDataKey = new Uint8Array(await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    decodeBase64Url(envelope.wrappedRecipientKey),
  ));
  try {
    if (rawDataKey.length !== 32) throw new Error('Unwrapped message key has an invalid size.');
    const dataKey = await crypto.subtle.importKey(
      'raw',
      rawDataKey,
      { name: 'AES-GCM' },
      false,
      ['decrypt'],
    );
    return new Uint8Array(await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: decodeBase64Url(envelope.iv),
        additionalData: messageAdditionalData(
          userId,
          documentId,
          envelope.keyId,
          envelope.recipientKeyId,
        ),
        tagLength: 128,
      },
      dataKey,
      decodeBase64Url(envelope.ciphertext),
    ));
  } finally {
    rawDataKey.fill(0);
  }
}
