'use client';

import {
  PublicClientApplication,
  type AccountInfo,
  type Configuration,
} from '@azure/msal-browser';

const clientId = process.env.NEXT_PUBLIC_ENTRA_CLIENT_ID;
const tenantId = process.env.NEXT_PUBLIC_ENTRA_TENANT_ID;
const apiScope = process.env.NEXT_PUBLIC_ENTRA_API_SCOPE;

const configuration: Configuration = {
  auth: {
    clientId: clientId || '',
    authority: tenantId
      ? `https://login.microsoftonline.com/${tenantId}`
      : 'https://login.microsoftonline.com/organizations',
    redirectUri: typeof window === 'undefined'
      ? undefined
      : window.location.origin,
  },
  cache: { cacheLocation: 'sessionStorage' },
};

const msal = new PublicClientApplication(configuration);
let initialized: Promise<void> | undefined;

function requiredApiScope(): string {
  if (!apiScope) throw new Error('Configure NEXT_PUBLIC_ENTRA_API_SCOPE in the frontend environment.');
  return apiScope;
}

async function ready(): Promise<void> {
  if (!clientId) throw new Error('Configure NEXT_PUBLIC_ENTRA_CLIENT_ID in the frontend environment.');
  requiredApiScope();
  initialized ??= msal.initialize().then(async () => {
    const result = await msal.handleRedirectPromise();
    const account = result?.account ?? msal.getActiveAccount() ?? msal.getAllAccounts()[0];
    if (account) msal.setActiveAccount(account);
  });
  await initialized;
}

export async function getSignedInAccount(): Promise<AccountInfo | null> {
  await ready();
  return msal.getActiveAccount();
}

export async function signIn(): Promise<void> {
  await ready();
  await msal.loginRedirect({ scopes: [requiredApiScope()] });
}

export async function signOut(): Promise<void> {
  await ready();
  await msal.logoutRedirect({ account: msal.getActiveAccount() });
}

export async function getApiAccessToken(): Promise<string> {
  await ready();
  const account = msal.getActiveAccount();
  if (!account) throw new Error('Sign in with your organization account before using the API.');
  const result = await msal.acquireTokenSilent({ account, scopes: [requiredApiScope()] });
  return result.accessToken;
}

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const token = await getApiAccessToken();
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers, cache: 'no-store' });
}
