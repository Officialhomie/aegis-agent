import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
  display: 'swap',
});

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
  display: 'swap',
});

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
      <body
        className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
      </body>
    </html>
  );
}
