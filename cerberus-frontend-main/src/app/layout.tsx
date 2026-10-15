import type { Metadata } from 'next';
import './globals.css';
import { AppHeader } from '@/components/layout/AppHeader';

export const metadata: Metadata = {
  title: 'Cerberus | Security Operations',
  description: 'Banking security API prototype for passkey access, tenant alerts, encryption, and audit operations.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased selection:bg-blue-100 selection:text-blue-950">
        <AppHeader />
        <main>{children}</main>
      </body>
    </html>
  );
}
