import { Header } from '@/components/layout/header';
import { Hero } from '@/components/landing/hero';
import { HowItWorks } from '@/components/landing/how-it-works';
import { Stats } from '@/components/landing/stats';
import { ForProtocols } from '@/components/landing/for-protocols';
import { ForAgents } from '@/components/landing/for-agents';
import { Footer } from '@/components/landing/footer';

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <Hero />
        <HowItWorks />
        <Stats />
        <ForProtocols />
        <ForAgents />
      </main>
      <Footer />
    </div>
  );
}
