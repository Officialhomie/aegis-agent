export const MARKETING_FPS = 30;
export const SLIDE_DURATION_SECONDS = 4;
export const SLIDE_DURATION_FRAMES = MARKETING_FPS * SLIDE_DURATION_SECONDS;

export type SlideVariant =
  | 'robotHook'
  | 'chatVsActions'
  | 'fareTap'
  | 'fuelGauge'
  | 'twoColumnPain'
  | 'wordmark'
  | 'dashboard'
  | 'fairnessMeter'
  | 'rulesChecklist'
  | 'paidStamp'
  | 'receiptTrail'
  | 'networkStrip'
  | 'hackathonFrame'
  | 'demoTerminal'
  | 'ctaEnd';

export type MarketingSlide = {
  id: string;
  title: string;
  subtitle?: string;
  technicalHint?: string;
  variant: SlideVariant;
};

export const MARKETING_SLIDES: MarketingSlide[] = [
  {
    id: 'hook',
    title: 'Agents shouldn’t freeze mid-task',
    subtitle: 'Autonomous apps need fuel to keep moving.',
    technicalHint: 'Onchain agents stall when wallets run dry.',
    variant: 'robotHook',
  },
  {
    id: 'chat-vs-do',
    title: 'Chatting is easy. Doing is hard.',
    subtitle: 'This story is about AI that takes real actions.',
    technicalHint: 'Action agents ≠ chat-only LLMs.',
    variant: 'chatVsActions',
  },
  {
    id: 'cost',
    title: 'Every action has a “bus fare”',
    subtitle: 'Small fees add up fast onchain.',
    technicalHint: 'Gas / execution fees per transaction.',
    variant: 'fareTap',
  },
  {
    id: 'empty',
    title: 'When balance hits zero — full stop',
    subtitle: 'Users see errors. Builders get paged.',
    technicalHint: 'Insufficient funds → reverted or stuck UserOps.',
    variant: 'fuelGauge',
  },
  {
    id: 'pain',
    title: 'Pain on both sides',
    subtitle: 'Bad UX for users. Ops load for teams.',
    technicalHint: 'Manual top-ups, monitoring, incident noise.',
    variant: 'twoColumnPain',
  },
  {
    id: 'meet',
    title: 'Meet Aegis',
    subtitle: 'Autopilot that keeps agents moving safely.',
    technicalHint: 'Policy-aware sponsorship + observability.',
    variant: 'wordmark',
  },
  {
    id: 'watch',
    title: 'Watches what agents need',
    subtitle: 'Surfaces low balance and risky moments early.',
    technicalHint: 'Observes chain + budgets + agent state.',
    variant: 'dashboard',
  },
  {
    id: 'fair',
    title: 'Helps only when it’s fair',
    subtitle: 'Not a blank check — judgment + limits.',
    technicalHint: 'LLM + confidence; rate limits & caps.',
    variant: 'fairnessMeter',
  },
  {
    id: 'rules',
    title: 'Your rules stay in charge',
    subtitle: 'Budgets, allow-lists, and guardrails you define.',
    technicalHint: 'Policy engine before any sponsorship.',
    variant: 'rulesChecklist',
  },
  {
    id: 'pay',
    title: 'Covers the fee, finishes the job',
    subtitle: 'Like a company card with approvals built in.',
    technicalHint: 'ERC-4337 paymaster / sponsored UserOps.',
    variant: 'paidStamp',
  },
  {
    id: 'trail',
    title: 'A clear trail for every call',
    subtitle: 'Receipts teams and auditors can trust.',
    technicalHint: 'Onchain logs + structured decision memory.',
    variant: 'receiptTrail',
  },
  {
    id: 'base',
    title: 'Built for onchain agents on Base',
    subtitle: 'Fast, familiar L2 for real workloads.',
    technicalHint: 'Base mainnet + account abstraction patterns.',
    variant: 'networkStrip',
  },
  {
    id: 'why-hack',
    title: 'Why we shipped this here',
    subtitle: 'Your Hackathon Name — agents need reliable fuel.',
    technicalHint: 'Replace hackathon + track in slides.ts before render.',
    variant: 'hackathonFrame',
  },
  {
    id: 'demo',
    title: 'See it in action',
    subtitle: 'From “stuck” to “confirmed” in one flow.',
    technicalHint: 'Live demo / recording alongside this deck.',
    variant: 'demoTerminal',
  },
  {
    id: 'cta',
    title: 'Try Aegis',
    subtitle: 'github.com/your-org/aegis-agent',
    technicalHint: 'Update URL + add QR asset if needed.',
    variant: 'ctaEnd',
  },
];

export const MARKETING_TOTAL_FRAMES =
  MARKETING_SLIDES.length * SLIDE_DURATION_FRAMES;
