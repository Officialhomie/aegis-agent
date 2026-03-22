import Link from 'next/link';
import { Header } from '@/components/layout/header';

const nav = [
  { href: '/control', label: 'Overview' },
  { href: '/control/onboarding', label: 'Onboarding' },
  { href: '/control/chat', label: 'Chat' },
  { href: '/control/activity', label: 'Activity' },
  { href: '/control/settings/policy', label: 'Policy' },
  { href: '/control/settings/tier', label: 'Tier' },
];

export default function ControlLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="mx-auto flex max-w-6xl gap-8 px-4 py-8">
        <aside className="hidden w-48 shrink-0 md:block">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Aeg-control
          </p>
          <nav className="flex flex-col gap-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-2 py-1.5 text-sm text-foreground/80 hover:bg-muted hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
