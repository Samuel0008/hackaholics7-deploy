export interface DecoyAuditExport {
  reportId: string;
  reportTitle: string;
  classification: 'SYNTHETIC-DECOY-NOT-REAL';
  generatedAt: string;
  reviewStatus: string;
  entries: {
    eventId: string;
    subjectId: string;
    system: string;
    action: string;
    outcome: string;
    reviewFlag: string;
    occurredAt: string;
  }[];
}

export function createDecoyAuditExport(now = new Date()): DecoyAuditExport {
  const generatedAt = now.toISOString();
  const previousHour = new Date(now.getTime() - 60 * 60_000).toISOString();

  return {
    reportId: 'SYNTHETIC-AR-2026-Q4-0042',
    reportTitle: 'Privileged Access Exception Review - Internal Audit Export',
    classification: 'SYNTHETIC-DECOY-NOT-REAL',
    generatedAt,
    reviewStatus: 'Pending compliance review',
    entries: [
      {
        eventId: 'SYNTHETIC-EVT-84017',
        subjectId: 'SYNTHETIC-EMP-1042',
        system: 'Treasury Operations Sandbox',
        action: 'Privileged session elevation',
        outcome: 'Approved - review required',
        reviewFlag: 'BREAK_GLASS_SESSION',
        occurredAt: previousHour,
      },
      {
        eventId: 'SYNTHETIC-EVT-84018',
        subjectId: 'SYNTHETIC-EMP-2088',
        system: 'Payment Reconciliation Sandbox',
        action: 'Bulk payment exception export',
        outcome: 'Completed - review required',
        reviewFlag: 'UNUSUAL_EXPORT_VOLUME',
        occurredAt: generatedAt,
      },
    ],
  };
}

export function createDecoyRobotsText(): string {
  return [
    'User-agent: *',
    'Disallow: /api/.env',
    'Disallow: /api/debug/config',
    'Disallow: /api/backup/database.sql',
    'Disallow: /api/internal/employee/access-review-export.json',
    '# Restricted application configuration and audit recovery artifacts.',
    '',
  ].join('\n');
}

export function createDecoyEnvironmentFile(): string {
  return [
    'APP_ENV=production',
    'SERVICE_NAME=treasury-audit-gateway',
    'DATABASE_URL=postgres://audit_reader:decoy-invalid@audit-db.invalid:5432/ledger',
    'AZURE_CLIENT_ID=00000000-0000-0000-0000-000000000000',
    'AZURE_CLIENT_SECRET=DECOY-NOT-A-CREDENTIAL',
    'AUDIT_EXPORT_CONTAINER=synthetic-audit-archive',
    '',
  ].join('\n');
}

export function createDecoyDebugConfig(): Record<string, unknown> {
  return {
    service: 'treasury-audit-gateway',
    environment: 'production',
    build: '2026.10.14+synthetic',
    database: {
      host: 'audit-db.invalid',
      name: 'ledger',
      user: 'audit_reader',
      password: 'DECOY-NOT-A-CREDENTIAL',
    },
    storage: {
      account: 'syntheticauditarchive',
      container: 'privileged-review-export',
    },
    diagnostic: 'SYNTHETIC-DECOY-NOT-REAL',
  };
}

export function createDecoyDatabaseBackup(): string {
  return [
    '-- SYNTHETIC DECOY BACKUP - NO REAL BANK DATA',
    'CREATE TABLE privileged_review (',
    '  event_id TEXT,',
    '  subject_id TEXT,',
    '  action TEXT,',
    '  review_status TEXT',
    ');',
    "INSERT INTO privileged_review VALUES ('SYNTHETIC-EVT-84017', 'SYNTHETIC-EMP-1042', 'break-glass-session', 'pending-review');",
    "INSERT INTO privileged_review VALUES ('SYNTHETIC-EVT-84018', 'SYNTHETIC-EMP-2088', 'bulk-export-review', 'pending-review');",
    '',
  ].join('\n');
}
