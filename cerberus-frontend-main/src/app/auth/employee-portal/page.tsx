import { WebAuthnEnrollmentCard } from '@/components/auth/WebAuthnEnrollmentCard';
import { DecoyWorkerStatus } from '@/components/auth/DecoyWorkerStatus';

export default function EmployeePortalPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="mx-auto max-w-4xl space-y-8 px-5 py-10 sm:px-8">
        <header className="max-w-2xl">
          <p className="text-sm font-medium text-blue-700">Employee access</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
            Passkey and message testing
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Entra-authorized passkey enrollment, short-lived employee sessions, and browser-side encrypted-message testing.
          </p>
        </header>
        <WebAuthnEnrollmentCard />
        <DecoyWorkerStatus />
      </div>
    </div>
  );
}
