export interface SyntheticWireTransaction {
  id: string;
  timestamp: string;
  referenceNumber: string;
  senderName: string;
  senderAccountMasked: string;
  senderRouting: string;
  senderBic: string;
  beneficiaryName: string;
  beneficiaryAccountMasked: string;
  beneficiaryBank: string;
  amountUsd: number;
  currency: string;
  clearingSystem: 'FEDWIRE' | 'CHIPS' | 'SWIFT_GPI' | 'TARGET2';
  decoyTrapFlag: boolean;
  transitHash: string;
}

export const SYNTHETIC_WIRE_FEED: SyntheticWireTransaction[] = [
  {
    id: 'WIRE-2026-90812',
    timestamp: '2026-10-14T15:02:11.200Z',
    referenceNumber: 'FW-9821-4401-X',
    senderName: 'Apex Capital Prime Escrow',
    senderAccountMasked: '•••• •••• 8821',
    senderRouting: '021000021 (JPMorgan NY)',
    senderBic: 'CHASUS33',
    beneficiaryName: 'Global Commodities Liquidity LLC',
    beneficiaryAccountMasked: '•••• •••• 4190',
    beneficiaryBank: 'Citibank N.A. London',
    amountUsd: 1425000.0,
    currency: 'USD',
    clearingSystem: 'FEDWIRE',
    decoyTrapFlag: true,
    transitHash: '7c9a3b8d1e2f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b',
  },
  {
    id: 'WIRE-2026-90813',
    timestamp: '2026-10-14T15:04:45.812Z',
    referenceNumber: 'CH-4109-7723-B',
    senderName: 'Meridian Treasury Settlement',
    senderAccountMasked: '•••• •••• 1044',
    senderRouting: '121000358 (Bank of America SF)',
    senderBic: 'BOFAUS3N',
    beneficiaryName: 'Nordic Sovereign Holdings AS',
    beneficiaryAccountMasked: '•••• •••• 9931',
    beneficiaryBank: 'DNB Bank ASA Oslo',
    amountUsd: 840000.0,
    currency: 'USD',
    clearingSystem: 'SWIFT_GPI',
    decoyTrapFlag: true,
    transitHash: '3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b',
  },
  {
    id: 'WIRE-2026-90814',
    timestamp: '2026-10-14T15:07:02.105Z',
    referenceNumber: 'FW-1192-3840-Q',
    senderName: 'Vanguard Custody Clearing Corp',
    senderAccountMasked: '•••• •••• 7712',
    senderRouting: '031000053 (Wells Fargo Philly)',
    senderBic: 'WFBIUS6S',
    beneficiaryName: 'Pacific Rim Trade Settlement Ltd',
    beneficiaryAccountMasked: '•••• •••• 6204',
    beneficiaryBank: 'HSBC Hong Kong',
    amountUsd: 2015000.0,
    currency: 'USD',
    clearingSystem: 'CHIPS',
    decoyTrapFlag: true,
    transitHash: 'f1e2d3c4b5a69788796a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e',
  },
  {
    id: 'WIRE-2026-90815',
    timestamp: '2026-10-14T15:09:30.450Z',
    referenceNumber: 'FW-8842-1092-K',
    senderName: 'Zurich Private Wealth Trust',
    senderAccountMasked: '•••• •••• 5599',
    senderRouting: '026009593 (BNY Mellon NY)',
    senderBic: 'BKTRUS33',
    beneficiaryName: 'Decoy Honey-Vault Transit Alpha',
    beneficiaryAccountMasked: '•••• •••• 0021',
    beneficiaryBank: 'Cerberus Synthetic Canary Core',
    amountUsd: 5900000.0,
    currency: 'USD',
    clearingSystem: 'FEDWIRE',
    decoyTrapFlag: true,
    transitHash: '98a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7',
  },
];
