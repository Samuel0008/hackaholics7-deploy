export interface WebAuthnRegistrationOptions {
  challenge: string;
  rp: {
    name: string;
    id: string;
  };
  user: {
    id: string;
    name: string;
    displayName: string;
  };
  pubKeyCredParams: Array<{
    alg: number;
    type: 'public-key';
  }>;
  timeout?: number;
  attestation?: 'none' | 'indirect' | 'direct' | 'enterprise';
  authenticatorSelection?: {
    authenticatorAttachment?: 'platform' | 'cross-platform';
    requireResidentKey?: boolean;
    residentKey?: 'discouraged' | 'preferred' | 'required';
    userVerification?: 'required' | 'preferred' | 'discouraged';
  };
}

export interface WebAuthnVerificationResponse {
  verified: boolean;
  deviceId?: string;
  credentialId?: string;
  publicKey?: string;
  algorithm?: string;
  isHardwareBound?: boolean;
  aaguid?: string;
  signCount: number;
  timestamp: string;
}

export interface AttestationStatus {
  isRegistered: boolean;
  isHardwareBound: boolean;
  algorithm: string;
  credentialId?: string;
  publicKeyDigest?: string;
  userEmail?: string;
  enrolledAt?: string;
}
