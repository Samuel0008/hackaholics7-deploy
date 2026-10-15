/**
 * Cerberus Isolated Decoy Security Worker
 * Executes off-thread decoy synchronization & AES-GCM verification.
 * Runs silently in the background without causing main-thread UI jitter or frame drops.
 */

let pollIntervalId = null;
let isPolling = false;

function base64ToUint8(base64) {
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  return new Uint8Array(0);
}

async function verifyTransitBlock(block) {
  const t0 = performance.now();
  if (!self.crypto || !self.crypto.subtle) {
    return {
      canaryTriggered: true,
      timeMs: 0.1,
      error: 'SubtleCrypto not present in worker',
    };
  }

  try {
    // Generate/derive dummy AES key for transit verification
    const dummyKey = new Uint8Array(32);
    const cryptoKey = await self.crypto.subtle.importKey(
      'raw',
      dummyKey,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    const iv = base64ToUint8(block.iv);
    const ciphertext = base64ToUint8(block.ciphertext);
    const tag = block.tag ? base64ToUint8(block.tag) : new Uint8Array(0);

    const combined = new Uint8Array(ciphertext.byteLength + tag.byteLength);
    combined.set(ciphertext, 0);
    combined.set(tag, ciphertext.byteLength);

    await self.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv,
        tagLength: 128,
      },
      cryptoKey,
      combined.buffer
    );

    const t1 = performance.now();
    return {
      canaryTriggered: false,
      timeMs: Math.max(0.1, parseFloat((t1 - t0).toFixed(2))),
      verified: true,
    };
  } catch (err) {
    const t1 = performance.now();
    // Decoy payload intentionally produces an auth tag mismatch
    return {
      canaryTriggered: true,
      timeMs: Math.max(0.1, parseFloat((t1 - t0).toFixed(2))),
      verified: false,
      status: 'CANARY_MISMATCH_CAUGHT_SILENTLY',
    };
  }
}

async function performSync() {
  try {
    const res = await fetch('/api/bff/employee/sync-payload');
    if (!res.ok) {
      self.postMessage({
        type: 'ERROR',
        error: `Sync request returned ${res.status}`,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const payload = await res.json();
    const verification = await verifyTransitBlock(payload.encryptedTransitBlock);

    self.postMessage({
      type: 'VERIFICATION_RESULT',
      syncId: payload.syncId,
      canaryId: payload.canaryId,
      epoch: payload.epoch,
      timeMs: verification.timeMs,
      canaryTriggered: verification.canaryTriggered,
      verified: verification.verified,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    self.postMessage({
      type: 'ERROR',
      error: err instanceof Error ? err.message : 'Unknown worker sync error',
      timestamp: new Date().toISOString(),
    });
  }
}

self.onmessage = function (event) {
  const { action, intervalMs = 10000 } = event.data || {};

  if (action === 'START') {
    if (isPolling) clearInterval(pollIntervalId);
    isPolling = true;
    performSync();
    pollIntervalId = setInterval(performSync, intervalMs);
    self.postMessage({ type: 'STATUS', running: true, intervalMs });
  } else if (action === 'STOP') {
    if (pollIntervalId) clearInterval(pollIntervalId);
    isPolling = false;
    self.postMessage({ type: 'STATUS', running: false });
  } else if (action === 'SYNC_NOW') {
    performSync();
  }
};
