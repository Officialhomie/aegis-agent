'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { DocsSidebar, MobileDocsSidebar } from '@/components/docs/sidebar';

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Mobile nav toggle */}
      <div className="lg:hidden fixed bottom-4 right-4 z-30">
        <button
          onClick={() => setMobileNavOpen(true)}
          className="p-3 bg-coral-500 text-white rounded-full shadow-lg hover:bg-coral-600 transition-colors"
        >
          <Menu className="h-6 w-6" />
        </button>
      </div>

      <div className="flex">
        {/* Desktop sidebar */}
        <div className="hidden lg:block">
          <DocsSidebar />
        </div>

        {/* Mobile sidebar */}
        <MobileDocsSidebar
          isOpen={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
        />

        {/* Main content */}
        <main className="flex-1 min-w-0">
          <div className="max-w-4xl mx-auto px-6 py-12">{children}</div>
        </main>
      </div>
    </div>
  );
}
