import { Bot, CheckCircle, XCircle } from 'lucide-react';

const requirements = [
  { text: 'Wallet with 5+ historical transactions', met: true },
  { text: 'Interacting with whitelisted protocol', met: true },
  { text: 'Transaction under gas limit threshold', met: true },
  { text: 'No abuse pattern detected', met: true },
];

export function ForAgents() {
  return (
    <section id="for-agents" className="py-24 px-6 bg-surface/50">
      <div className="max-w-5xl mx-auto">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* Left: Visual */}
          <div className="order-2 md:order-1 relative">
            <div className="card-agentic p-8">
              {/* Mock agent eligibility check */}
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-full bg-cyan-500/20 flex items-center justify-center">
                  <Bot className="h-6 w-6 text-cyan-400" />
                </div>
                <div>
                  <div className="font-medium text-text-primary">Eligibility Check</div>
                  <div className="text-sm text-success">Passed</div>
                </div>
              </div>

              <div className="space-y-3">
                {requirements.map((req) => (
                  <div key={req.text} className="flex items-center gap-3 p-3 bg-elevated rounded-lg">
                    {req.met ? (
                      <CheckCircle className="h-5 w-5 text-success flex-shrink-0" />
                    ) : (
                      <XCircle className="h-5 w-5 text-error flex-shrink-0" />
                    )}
                    <span className="text-sm text-text-secondary">{req.text}</span>
                  </div>
                ))}
              </div>

              <div className="mt-6 p-4 rounded-lg bg-success/10 border border-success/20">
                <div className="flex items-center gap-2 text-success font-medium">
                  <CheckCircle className="h-5 w-5" />
                  <span>Transaction will be sponsored</span>
                </div>
              </div>
            </div>

            {/* Glow effect */}
            <div className="absolute -inset-4 bg-gradient-to-r from-cyan-500/10 to-coral-500/10 rounded-2xl blur-2xl -z-10" />
          </div>

          {/* Right: Content */}
          <div className="order-1 md:order-2">
            <span className="text-cyan-400 font-medium text-sm uppercase tracking-wider">
              For AI Agents
            </span>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-text-primary mt-2 mb-6">
              Zero Gas, Zero Friction
            </h2>
            <p className="text-lg text-text-secondary mb-6">
              If your agent wallet is interacting with a registered protocol, Aegis will
              automatically check eligibility and sponsor the gas fee. No setup required.
            </p>

            <div className="space-y-4 mb-8">
              <FeatureItem
                title="Automatic Detection"
                description="Aegis monitors registered protocol contracts for agent transactions."
              />
              <FeatureItem
                title="Instant Sponsorship"
                description="Eligible transactions are sponsored within the same block."
              />
              <FeatureItem
                title="Reputation Building"
                description="Successful sponsorships earn on-chain reputation attestations."
              />
            </div>

            <div className="text-sm text-text-muted">
              Want your protocol supported?{' '}
              <a href="/protocols/register" className="text-cyan-400 hover:underline">
                Register now
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureItem({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-1 bg-gradient-to-b from-cyan-500 to-coral-500 rounded-full" />
      <div>
        <h3 className="font-medium text-text-primary mb-1">{title}</h3>
        <p className="text-sm text-text-secondary">{description}</p>
      </div>
    </div>
  );
}
