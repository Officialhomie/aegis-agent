export const BOT_MARKETING_FPS = 30;
export const BOT_SLIDE_DURATION_SECONDS = 4;
export const BOT_SLIDE_DURATION_FRAMES = BOT_MARKETING_FPS * BOT_SLIDE_DURATION_SECONDS;

export type BotSlideVariant =
  | 'telegramHook'
  | 'aegisPowerful'
  | 'fourPains'
  | 'botWordmark'
  | 'walletStep'
  | 'depositStep'
  | 'budgetStep'
  | 'delegationStep'
  | 'agentActive'
  | 'guaranteeCmd'
  | 'passportCmd'
  | 'costsCmd'
  | 'archDiagram'
  | 'securityModel'
  | 'botCta';

export type BotMarketingSlide = {
  id: string;
  title: string;
  subtitle?: string;
  technicalHint?: string;
  variant: BotSlideVariant;
};

export const BOT_MARKETING_SLIDES: BotMarketingSlide[] = [
  {
    id: 'hook',
    title: 'Your AI agent. In your pocket.',
    subtitle: 'One Telegram command. Full autonomous control.',
    technicalHint: 'grammy bot framework on Node.js',
    variant: 'telegramHook',
  },
  {
    id: 'aegis-powerful',
    title: 'Aegis is powerful, but...',
    subtitle: 'There\'s no consumer-facing interface.',
    technicalHint: 'API-only — no wallet UI, no mobile, no visibility',
    variant: 'aegisPowerful',
  },
  {
    id: 'four-pains',
    title: 'Four barriers to entry',
    subtitle: 'All solved by aeg-control.',
    technicalHint: 'No UI · API knowledge · No mobile · Crypto UX',
    variant: 'fourPains',
  },
  {
    id: 'meet-bot',
    title: 'Introducing aeg-control',
    subtitle: 'The Telegram consumer bot for Aegis.',
    technicalHint: 'grammy + viem + Hono + Redis on Node 20',
    variant: 'botWordmark',
  },
  {
    id: 'wallet-step',
    title: 'Step 1: Wallet created for you',
    subtitle: 'Custodial. Encrypted. Never logged.',
    technicalHint: 'viem generatePrivateKey + AES-256-GCM',
    variant: 'walletStep',
  },
  {
    id: 'deposit-step',
    title: 'Step 2: Deposit USDC',
    subtitle: 'Detected on-chain automatically.',
    technicalHint: 'viem getLogs polling every 15 seconds',
    variant: 'depositStep',
  },
  {
    id: 'budget-step',
    title: 'Step 3: Set your daily budget',
    subtitle: 'Spending is enforced — not trusted.',
    technicalHint: 'Budget stored in Redis session + delegation scope',
    variant: 'budgetStep',
  },
  {
    id: 'delegation-step',
    title: 'Step 4: Sign your delegation',
    subtitle: 'EIP-712 scoped to your exact budget.',
    technicalHint: 'encodePacked domain separator matching Aegis verifyDelegationSignature',
    variant: 'delegationStep',
  },
  {
    id: 'agent-active',
    title: 'Step 5: Agent is live',
    subtitle: 'Just type what you want. Aegis executes.',
    technicalHint: 'Free text → POST /api/openclaw → AegisResponse',
    variant: 'agentActive',
  },
  {
    id: 'guarantee-cmd',
    title: '/guarantee',
    subtitle: 'See exactly what your agent can and can\'t do.',
    technicalHint: 'Fetches active delegation: contracts, functions, limits',
    variant: 'guaranteeCmd',
  },
  {
    id: 'passport-cmd',
    title: '/passport',
    subtitle: 'Your agent\'s identity card and trust score.',
    technicalHint: 'GET /api/v1/passport → tier, score, wallet',
    variant: 'passportCmd',
  },
  {
    id: 'costs-cmd',
    title: '/costs',
    subtitle: 'Daily spend vs budget, burn rate.',
    technicalHint: 'Delegation usage tracked per userId in Redis',
    variant: 'costsCmd',
  },
  {
    id: 'arch-diagram',
    title: 'How it\'s built',
    subtitle: 'Four components. One clean flow.',
    technicalHint: 'grammy | viem | Hono | Redis — all TypeScript',
    variant: 'archDiagram',
  },
  {
    id: 'security',
    title: 'Security by design',
    subtitle: 'Keys never touch logs. Spending enforced on-chain.',
    technicalHint: 'AES-256-GCM iv+authTag+ciphertext | confirmation gate | EIP-712',
    variant: 'securityModel',
  },
  {
    id: 'cta',
    title: 'Try aeg-control',
    subtitle: 'github.com/Officialhomie/aeg-control',
    technicalHint: 'Open source · MIT · Deploy in 5 min',
    variant: 'botCta',
  },
];

export const BOT_MARKETING_TOTAL_FRAMES =
  BOT_MARKETING_SLIDES.length * BOT_SLIDE_DURATION_FRAMES;
