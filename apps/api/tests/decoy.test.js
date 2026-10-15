import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDecoyAuditExport,
  createDecoyDatabaseBackup,
  createDecoyDebugConfig,
  createDecoyEnvironmentFile,
  createDecoyRobotsText,
} from '../dist/decoy.js';

test('backend decoy looks like an audit export but is clearly synthetic and contains no secrets', () => {
  const decoy = createDecoyAuditExport(new Date('2026-10-14T12:00:00.000Z'));
  const serialized = JSON.stringify(decoy);

  assert.equal(decoy.reportTitle, 'Privileged Access Exception Review - Internal Audit Export');
  assert.equal(decoy.classification, 'SYNTHETIC-DECOY-NOT-REAL');
  assert.equal(decoy.entries.length, 2);
  assert.match(serialized, /SYNTHETIC-EMP-/u);
  assert.doesNotMatch(serialized, /password|bearer|access.?token|secret|private.?key/iu);
});

test('API robots metadata points only to the backend decoy path', () => {
  const robots = createDecoyRobotsText();

  assert.match(robots, /User-agent: \*/u);
  assert.match(robots, /Disallow: \/api\/\.env/u);
  assert.match(robots, /Disallow: \/api\/debug\/config/u);
  assert.match(robots, /Disallow: \/api\/backup\/database\.sql/u);
  assert.match(robots, /Disallow: \/api\/internal\/employee\/access-review-export\.json/u);
  assert.doesNotMatch(robots, /sync\/|passkeys\/|keys\/message/u);
});

test('vulnerability-bait files contain no usable credentials or real data', () => {
  const environmentFile = createDecoyEnvironmentFile();
  const debugConfig = JSON.stringify(createDecoyDebugConfig());
  const backup = createDecoyDatabaseBackup();

  assert.match(environmentFile, /audit-db\.invalid/u);
  assert.match(environmentFile, /DECOY-NOT-A-CREDENTIAL/u);
  assert.match(debugConfig, /DECOY-NOT-A-CREDENTIAL/u);
  assert.match(debugConfig, /SYNTHETIC-DECOY-NOT-REAL/u);
  assert.match(backup, /SYNTHETIC DECOY BACKUP/u);
  assert.match(backup, /SYNTHETIC-EMP-/u);
  assert.doesNotMatch(`${environmentFile}${debugConfig}${backup}`, /BEGIN (RSA )?PRIVATE KEY/u);
});
