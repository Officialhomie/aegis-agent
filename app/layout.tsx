import type { Metadata, Viewport } from 'next';
import './globals.css';

// Use link-based fonts so build does not require outbound access to Google Fonts (CI/sandbox-friendly).
// CSS variables are set in globals.css or here for consistency with previous next/font usage.
const fontClassNames =
  'font-sans antialiased'; /* Space Grotesk / Inter loaded via link in head */

export const metadata: Metadata = {
  title: {
    default: 'Aegis - Autonomous Gas Sponsorship for AI Agents',
    template: '%s | Aegis',
  },
  description:
    'Aegis is an autonomous paymaster agent that sponsors gas fees for AI agents on Base. Register your protocol, deposit funds, and let Aegis handle the rest.',
  keywords: [
    'gas sponsorship',
    'paymaster',
    'ERC-4337',
    'account abstraction',
    'AI agents',
    'Base',
    'Ethereum L2',
    'gasless transactions',
  ],
  authors: [{ name: 'Aegis Agent' }],
  openGraph: {
    title: 'Aegis - Autonomous Gas Sponsorship for AI Agents',
    description: 'Sponsor gas fees for AI agents on Base with an autonomous paymaster.',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Aegis - Autonomous Gas Sponsorship',
    description: 'Sponsor gas fees for AI agents on Base with an autonomous paymaster.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#050810',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&family=JetBrains+Mono:wght@100..800&family=Space+Grotesk:wght@300..700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={`${fontClassNames} bg-background text-foreground`}>
        {children}
      </body>
    </html>
  );
}
