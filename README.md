# Aegis Agent

**AI-Powered Autonomous Treasury Management Agent**

Aegis is an intelligent agent that manages blockchain treasury operations through a secure observe-reason-decide-act-memory loop. Built with Coinbase AgentKit, LangGraph, and modern AI infrastructure.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AEGIS AGENT                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │ OBSERVE  │───▶│  REASON  │───▶│  POLICY  │───▶│ EXECUTE  │  │
│  │          │    │          │    │          │    │          │  │
│  │ Blockchain│    │ LLM +    │    │ Safety   │    │ AgentKit │  │
│  │ State    │    │ Prompts  │    │ Rules    │    │ Wallet   │  │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘  │
│       │                                               │         │
│       │              ┌──────────┐                     │         │
│       └─────────────▶│  MEMORY  │◀────────────────────┘         │
│                      │          │                               │
│                      │ Postgres │                               │
│                      │ Pinecone │                               │
│                      └──────────┘                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Features

- **Observe**: Real-time blockchain state monitoring via viem
- **Reason**: LLM-powered decision making with structured outputs (GPT-4/Claude)
- **Policy**: Configurable safety rules and guardrails
- **Execute**: Secure transaction execution via Coinbase AgentKit
- **Memory**: Long-term learning with PostgreSQL + Pinecone vector search
- **x402 Integration**: Payment rails for agent-as-a-service

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 16, React 19 |
| AI/LLM | OpenAI GPT-4, Anthropic Claude, LangChain, LangGraph |
| Blockchain | Coinbase AgentKit, viem, x402 |
| Database | PostgreSQL, Prisma ORM |
| Vector DB | Pinecone |
| Validation | Zod |
| Testing | Vitest |

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- API keys for: OpenAI, Pinecone, Coinbase CDP

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/aegis-agent.git
cd aegis-agent

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys

# Generate Prisma client
npm run db:generate

# Push database schema
npm run db:push
```

### Configuration

1. Copy `.env.example` to `.env`
2. Configure your API keys:
   - `OPENAI_API_KEY` - For LLM reasoning
   - `PINECONE_API_KEY` - For memory vector storage
   - `CDP_API_KEY_NAME` & `CDP_API_KEY_PRIVATE_KEY` - For AgentKit
   - `DATABASE_URL` - PostgreSQL connection string
   - `RPC_URL_*` - Blockchain RPC endpoints

### Running the Agent

```bash
# Development mode with hot reload
npm run agent:dev

# Run once
npm run agent:run

# Run the web dashboard
npm run dev
```

### Testing

```bash
# Run tests
npm test

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

## Project Structure

```
aegis-agent/
├── src/
│   ├── app/                    # Next.js app router
│   │   └── api/                # API routes
│   └── lib/
│       ├── agent/              # Core agent logic
│       │   ├── observe/        # Blockchain state observation
│       │   ├── reason/         # LLM reasoning & prompts
│       │   ├── policy/         # Safety rules & validation
│       │   ├── execute/        # AgentKit execution
│       │   └── memory/         # Memory & learning
│       └── utils/              # Shared utilities
├── prisma/
│   └── schema.prisma           # Database schema
├── tests/                      # Test files
└── .env.example                # Environment template
```

## Agent Decision Flow

1. **Observe**: Gather current blockchain state (balances, gas prices, events)
2. **Retrieve Memories**: Query relevant past experiences from vector DB
3. **Reason**: LLM analyzes state and proposes action with confidence score
4. **Validate Policy**: Check decision against safety rules
5. **Execute**: If approved and confidence meets threshold, execute via AgentKit
6. **Store Memory**: Record decision and outcome for future learning

## Safety & Security

- **Policy Engine**: All decisions pass through configurable safety rules
- **Confidence Thresholds**: Actions require minimum confidence to execute
- **Execution Modes**: LIVE, SIMULATION, or READONLY
- **Smart Wallet**: AgentKit uses account abstraction with spending limits
- **LLM Isolation**: LLM never directly accesses private keys or constructs transactions

## Future Roadmap

- [ ] ERC-8004 on-chain agent identity integration
- [ ] Multi-agent coordination
- [ ] Advanced rebalancing strategies
- [ ] Governance participation automation
- [ ] Dashboard UI for monitoring and configuration

## License

MIT

## Contributing

Contributions welcome! Please read our contributing guidelines before submitting PRs.
