import Link from 'next/link';
import { Shield, Twitter, Github, MessageCircle } from 'lucide-react';

const footerLinks = {
  Product: [
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Register Protocol', href: '/protocols/register' },
    { label: 'Documentation', href: '/docs' },
  ],
  Community: [
    { label: 'Moltbook', href: 'https://www.moltbook.com', external: true },
    { label: 'Farcaster', href: 'https://warpcast.com', external: true },
    { label: 'GitHub', href: 'https://github.com', external: true },
  ],
  Resources: [
    { label: 'API Reference', href: '/docs/api' },
    { label: 'Status', href: '/status' },
    { label: 'Admin', href: '/admin' },
    { label: 'Terms', href: '/terms' },
  ],
};

export function Footer() {
  return (
    <footer className="border-t border-border bg-surface/50">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <Shield className="h-6 w-6 text-coral-500" />
              <span className="font-display font-bold text-text-primary">Aegis</span>
            </Link>
            <p className="text-sm text-text-secondary mb-4">
              Autonomous gas sponsorship for AI agents on Base.
            </p>
            <div className="flex items-center gap-4">
              <SocialLink href="https://twitter.com" icon={Twitter} label="Twitter" />
              <SocialLink href="https://github.com" icon={Github} label="GitHub" />
              <SocialLink href="https://www.moltbook.com" icon={MessageCircle} label="Moltbook" />
            </div>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h3 className="font-medium text-text-primary mb-3">{category}</h3>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      target={'external' in link && link.external ? '_blank' : undefined}
                      rel={'external' in link && link.external ? 'noopener noreferrer' : undefined}
                      className="text-sm text-text-muted hover:text-cyan-400 transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-border mt-12 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-text-muted">
            Built on Base. Powered by ERC-4337.
          </p>
          <p className="text-sm text-text-muted">
            {new Date().getFullYear()} Aegis Agent. Open source.
          </p>
        </div>
      </div>
    </footer>
  );
}

function SocialLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-text-muted hover:text-cyan-400 transition-colors"
      aria-label={label}
    >
      <Icon className="h-5 w-5" />
    </a>
  );
}
