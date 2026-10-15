import Link from 'next/link';
import { ArrowRight, KeyRound, LayoutDashboard, ShieldCheck } from 'lucide-react';

const destinations = [
  {
    href: '/auth/employee-portal',
    title: 'Employee access',
    description: 'Register or verify a passkey and test encrypted message handling.',
    detail: 'Passkeys · Encrypted messages',
    icon: ShieldCheck,
  },
  {
    href: '/soc/dashboard',
    title: 'Security alerts',
    description: 'Review tenant-scoped decoy alerts and available response operations.',
    detail: 'Alerts · Response',
    icon: LayoutDashboard,
  },
  {
    href: '/admin/crypto-registry',
    title: 'Key registry',
    description: 'Review configured key metadata and compliance audit records.',
    detail: 'Key metadata · Audit',
    icon: KeyRound,
  },
];

export default function Home() {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-blue-700">Banking security prototype</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
            Security operations
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
            A focused interface for testing employee authentication, encrypted data flows, tenant alerts, and audit operations.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {destinations.map(({ href, title, description, detail, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group rounded-xl border border-slate-200 bg-white p-6 transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="mt-5 flex items-center justify-between text-base font-semibold text-slate-950">
                {title}
                <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" />
              </h2>
              <p className="mt-2 min-h-12 text-sm leading-6 text-slate-600">{description}</p>
              <p className="mt-5 border-t border-slate-100 pt-4 text-xs text-slate-500">{detail}</p>
            </Link>
          ))}
        </div>

        <p className="mt-8 text-xs leading-5 text-slate-500">
          Prototype using synthetic test data only. Network threat detection, MDM enforcement, AML/OFAC screening, and hardware attestation are not provided.
        </p>
      </div>
    </div>
  );
}
