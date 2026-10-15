'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { KeyRound, LayoutDashboard, ShieldCheck } from 'lucide-react';
import { EntraAccountButton } from '@/components/auth/EntraAccountButton';

const navItems = [
  { name: 'Employee access', href: '/auth/employee-portal', icon: ShieldCheck },
  { name: 'Security alerts', href: '/soc/dashboard', icon: LayoutDashboard },
  { name: 'Key registry', href: '/admin/crypto-registry', icon: KeyRound },
];

export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-5 px-5 sm:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-3" aria-label="Cerberus home">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-sm font-semibold tracking-tight text-slate-950">Cerberus</span>
            <span className="block text-[11px] text-slate-500">Banking security prototype</span>
          </span>
        </Link>

        <nav aria-label="Main navigation" className="hidden items-center gap-1 md:flex">
          {navItems.map(({ name, href, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                  active
                    ? 'bg-slate-100 font-medium text-slate-950'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                }`}
              >
                <Icon className="h-4 w-4" />
                {name}
              </Link>
            );
          })}
        </nav>

        <div className="shrink-0">
          <EntraAccountButton />
        </div>
      </div>
      <nav aria-label="Main navigation" className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 md:hidden">
        {navItems.map(({ name, href }) => (
          <Link
            key={href}
            href={href}
            aria-current={pathname === href ? 'page' : undefined}
            className={`shrink-0 rounded-md px-3 py-2 text-xs ${
              pathname === href ? 'bg-slate-100 font-medium text-slate-950' : 'text-slate-600'
            }`}
          >
            {name}
          </Link>
        ))}
      </nav>
    </header>
  );
}
