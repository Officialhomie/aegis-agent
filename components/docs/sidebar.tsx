'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Rocket,
  Building2,
  Bot,
  Code,
  Cog,
  Shield,
  HelpCircle,
  ChevronRight,
  Award,
  UserCheck,
} from 'lucide-react';

interface NavItem {
  title: string;
  href: string;
  icon?: React.ComponentType<{ className?: string }>;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const docsNav: NavSection[] = [
  {
    title: 'Introduction',
    items: [
      { title: 'Overview', href: '/docs', icon: Rocket },
      { title: 'Getting Started', href: '/docs/getting-started', icon: Rocket },
    ],
  },
  {
    title: 'Integration',
    items: [
      { title: 'For Protocols', href: '/docs/protocols', icon: Building2 },
      { title: 'For AI Agents', href: '/docs/agents', icon: Bot },
      { title: 'Delegation', href: '/docs/delegation', icon: UserCheck },
    ],
  },
  {
    title: 'Reference',
    items: [
      { title: 'API Reference', href: '/docs/api', icon: Code },
      { title: 'Architecture', href: '/docs/architecture', icon: Cog },
      { title: 'Gas Passport', href: '/docs/gas-passport', icon: Award },
    ],
  },
  {
    title: 'Resources',
    items: [
      { title: 'Transparency', href: '/docs/transparency', icon: Shield },
      { title: 'FAQ', href: '/docs/faq', icon: HelpCircle },
    ],
  },
];

export function DocsSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 border-r border-border bg-surface/50 overflow-y-auto">
      <div className="sticky top-0 p-6">
        <Link href="/docs" className="flex items-center gap-2 mb-8">
          <Shield className="h-6 w-6 text-cyan-400" />
          <span className="font-display font-bold text-text-primary">Aegis Docs</span>
        </Link>

        <nav className="space-y-6">
          {docsNav.map((section) => (
            <div key={section.title}>
              <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                {section.title}
              </h4>
              <ul className="space-y-1">
                {section.items.map((item) => {
                  const isActive = pathname === item.href;
                  const Icon = item.icon;

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                          isActive
                            ? 'bg-cyan-500/10 text-cyan-400 font-medium'
                            : 'text-text-secondary hover:text-text-primary hover:bg-elevated'
                        )}
                      >
                        {Icon && <Icon className="h-4 w-4" />}
                        <span>{item.title}</span>
                        {isActive && <ChevronRight className="h-4 w-4 ml-auto" />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </aside>
  );
}

export function MobileDocsSidebar({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40 lg:hidden"
        onClick={onClose}
      />
      <aside className="fixed inset-y-0 left-0 w-72 bg-surface border-r border-border z-50 overflow-y-auto lg:hidden">
        <div className="p-6">
          <div className="flex items-center justify-between mb-8">
            <Link href="/docs" className="flex items-center gap-2" onClick={onClose}>
              <Shield className="h-6 w-6 text-cyan-400" />
              <span className="font-display font-bold text-text-primary">Aegis Docs</span>
            </Link>
            <button
              onClick={onClose}
              className="p-2 text-text-muted hover:text-text-primary"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <nav className="space-y-6">
            {docsNav.map((section) => (
              <div key={section.title}>
                <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                  {section.title}
                </h4>
                <ul className="space-y-1">
                  {section.items.map((item) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon;

                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={onClose}
                          className={cn(
                            'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                            isActive
                              ? 'bg-cyan-500/10 text-cyan-400 font-medium'
                              : 'text-text-secondary hover:text-text-primary hover:bg-elevated'
                          )}
                        >
                          {Icon && <Icon className="h-4 w-4" />}
                          <span>{item.title}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </div>
      </aside>
    </>
  );
}
