import { FileText, Wallet, Zap, ArrowRight } from 'lucide-react';

const steps = [
  {
    icon: FileText,
    title: 'Register',
    description: 'Add your protocol and whitelist the contracts you want sponsored.',
  },
  {
    icon: Wallet,
    title: 'Deposit',
    description: 'Fund your sponsorship budget with USDC. We handle the rest.',
  },
  {
    icon: Zap,
    title: 'Auto-Sponsor',
    description: 'Aegis autonomously sponsors gas for eligible agent transactions.',
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 px-6">
      <div className="max-w-5xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-16">
          <h2 className="font-display text-3xl md:text-4xl font-bold text-text-primary mb-4">
            How It Works
          </h2>
          <p className="text-lg text-text-secondary max-w-2xl mx-auto">
            Three simple steps to enable gasless transactions for your protocol&apos;s users.
          </p>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Connecting lines (desktop) */}
          <div className="hidden md:block absolute top-16 left-1/4 right-1/4 h-0.5 bg-gradient-to-r from-cyan-500/50 via-coral-500/50 to-cyan-500/50" />

          {steps.map((step, index) => (
            <div key={step.title} className="relative">
              {/* Step card */}
              <div className="card-agentic p-8 text-center h-full">
                {/* Step number */}
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-coral-500 flex items-center justify-center">
                  <span className="font-display font-bold text-white text-sm">{index + 1}</span>
                </div>

                {/* Icon */}
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-cyan-500/10 mb-6 mt-4">
                  <step.icon className="h-8 w-8 text-cyan-400" />
                </div>

                {/* Content */}
                <h3 className="font-display text-xl font-semibold text-text-primary mb-3">
                  {step.title}
                </h3>
                <p className="text-text-secondary">{step.description}</p>
              </div>

              {/* Arrow (mobile) */}
              {index < steps.length - 1 && (
                <div className="flex justify-center my-4 md:hidden">
                  <ArrowRight className="h-6 w-6 text-text-muted rotate-90" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
