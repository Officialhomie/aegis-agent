# Makefile & Aegis Agent Infrastructure Alignment

**Purpose:** Explain how the Makefile commands directly support Aegis Agent development, testing, debugging, and operations.

---

## Overview: Aegis Architecture

Aegis is an **autonomous gas reliability infrastructure** for agents on Base. It has a clear OODA loop:

```
OBSERVE → REASON → POLICY → EXECUTE
   ↓        ↓        ↓        ↓
  Chain    LLM      Rules    AgentKit
  State    Claude/  Safety   Wallet/
           GPT-4    Checks   Bundler
```

Each component has tests, configuration, and monitoring needs. The Makefile provides a unified interface to manage all of it.

---

## Command Mapping: Makefile → Aegis Components

### 1. TESTING (Core Agent Logic)

#### `make test` - Run All Tests
```bash
npm test  # runs vitest
```

**What it tests:**
- Observation parsing (blockchain state reading)
- Reasoning validation (LLM prompt outputs)
- Policy enforcement (safety rule checks)
- Execution correctness (transaction building)
- Memory operations (PostgreSQL + Pinecone)

**Critical for Aegis:**
- Ensures tier validation works (Tier 1 agents get priority)
- Validates gas price checks (MAX_GAS_PRICE_GWEI=2)
- Tests paymaster logic (token swaps, refunds)
- Confirms agent-first rejection of EOAs

**Command location:** `tests/` directory
```
tests/
├── integration/phase2-openclaw-commands.test.ts
├── agent/
│   ├── moltbook.test.ts
│   └── reason/observation-compressor.test.ts
├── lib/
│   ├── cache/redis-cache.test.ts
│   ├── delegation/service.test.ts
│   └── ...
```

#### `make test-watch` - Interactive Testing
```bash
npm test -- --watch
```

**Use case:** During development, when:
- Modifying tier validation logic
- Changing paymaster swap calculations
- Updating agent rejection rules
- Debugging observation parsing

**Workflow:**
```bash
# Terminal 1: Watch tests
make test-watch

# Terminal 2: Edit code
$EDITOR src/lib/agent/execute/paymaster.ts

# Terminal 1 automatically reruns relevant tests
```

#### `make test-ui` - Test Dashboard
```bash
npm test -- --ui
```

**Unique value:**
- Visual test explorer at http://localhost:51204
- See test files, pass/fail status, execution time
- Filter by test name or file
- Useful for understanding test coverage of Aegis components

**Example:** Find all tests related to "tier" or "sponsorship"

#### `make test-coverage` - Code Coverage Report
```bash
npm test -- run --coverage
```

**For Aegis operations:**
- Verify tier validation is fully tested
- Check paymaster path coverage
- Ensure safety rules are tested
- Identify untested edge cases in gas price validation

**Critical paths to monitor:**
```
- src/lib/agent/approved-agent-service.ts (tier validation)
- src/lib/agent/execute/paymaster.ts (sponsorship)
- src/lib/agent/execute/circuit-breaker.ts (safety)
- src/lib/agent/policy/ (policy enforcement)
```

---

### 2. TYPE CHECKING & LINTING (Code Quality)

#### `make typecheck` - TypeScript Validation
```bash
npm run typecheck  # tsc --noEmit
```

**Why it matters for Aegis:**
- Catches type mismatches in tier system enum (Tier 1, 2, 3)
- Validates blockchain state types match RPC responses
- Ensures gas price numbers don't overflow
- Confirms async/await chains in paymaster logic

**Critical:** Run before pushing changes to `claude/add-makefile-tests-TTgg5` branch

#### `make lint` - Code Style
```bash
npm run lint  # eslint
```

**Enforces:**
- Consistent naming (agentAddress, not agent_address)
- No unused imports (keeps code clean)
- Proper error handling patterns

---

### 3. BUILDING (Preparation for Deployment)

#### `make build` - Compile for Production
```bash
npm run build  # prisma generate && next build
```

**Includes:**
1. Prisma ORM client generation (for database operations)
2. Next.js app compilation (for dashboard/APIs)

**Pre-deployment checklist:**
```bash
make typecheck   # Catch type errors first
make lint        # Fix style issues
make test        # Ensure all tests pass
make build       # Final compilation
```

---

### 4. DEVELOPMENT (Active Work)

#### `make dev` - Web Dashboard
```bash
npm run dev  # next dev
```

**Launches:**
- Next.js development server (localhost:3000)
- Hot reload on file changes
- Access dashboard for:
  - Agent activity monitoring
  - Tier distribution visualization
  - Transaction success rates
  - Gas price trends

#### `make agent-dev` - Agent Development Mode
```bash
npm run agent:dev  # tsx watch src/lib/agent/index.ts
```

**For developers working on agent logic:**
- Runs agent with hot reload
- Observes changes to OODA loop components
- Logs reasoning decisions in real-time
- Useful for testing new policies or prompts

#### `make agent-run` - Single Agent Execution
```bash
npm run agent:run  # tsx src/lib/agent/index.ts
```

**For one-shot operations:**
- Run agent once
- Check current state
- Test specific scenario
- Useful for debugging production issues

---

### 5. DATABASE (State & Memory Management)

#### `make db-migrate` - Apply Pending Migrations
```bash
npm run db:migrate  # prisma migrate dev
```

**For Aegis:**
- Updates schema for new agent tiers
- Adds fields for mempool metrics (post-EIP-8141)
- Tracks frame transaction costs
- Manages paymaster history

**Example migration:**
```sql
-- Add support for frame transaction tracking
ALTER TABLE transactions ADD COLUMN frame_count INT;
ALTER TABLE transactions ADD COLUMN validation_gas BIGINT;
ALTER TABLE transactions ADD COLUMN paymaster_token VARCHAR;
```

#### `make db-generate` - Regenerate Prisma Client
```bash
npm run db:generate  # prisma generate
```

**When to run:**
- After modifying `prisma/schema.prisma`
- After dependencies update
- Syncs TypeScript types with database schema

#### `make db-push` - Sync Schema to Database
```bash
npm run db:push  # prisma db push
```

**Caution:** For development only. In production, use migrations.

#### `make db-studio` - Prisma Studio (GUI)
```bash
npm run db:studio  # Opens browser GUI
```

**Useful for:**
- Inspecting agent tier distribution
- Checking sponsorship history
- Verifying successful transactions
- Manual data corrections (if needed)

#### `make db-seed` - Initialize Database
```bash
npm run db:seed  # Runs prisma/seed.ts
```

**For Aegis:**
- Seeds initial agent tiers
- Creates test accounts
- Loads sample policies
- Useful for CI/CD and new environments

---

### 6. INFORMATION & DEBUGGING (Observability)

#### `make info` - Complete Project Overview
```bash
# Runs: env-info + deps-info + db-info
```

**Output includes:**
```
Environment Information:
  Node version: v22.22.0
  NPM version: 10.9.4
  Git branch: claude/add-makefile-tests-TTgg5
  Git commit: 317ceb3

Dependencies Information:
  Total packages installed: 971
  Critical packages:
    - @anthropic-ai/sdk (LLM integration)
    - @coinbase/cdp-agentkit-core (execution)
    - @prisma/client (database)
    - @pinecone-database/pinecone (memory)

Database Information:
  Database URL: postgres://...
  Prisma Client: Yes
  Schema file: Found
```

#### `make env-info` - Environment Details
```
Node version: v22.22.0
NPM version: 10.9.4
Current directory: /home/user/aegis-agent
Git branch: claude/add-makefile-tests-TTgg5
Git commit: 317ceb3
```

**For Aegis:**
- Confirms correct branch before deployment
- Verifies Node version (must be 20.x+)
- Ensures git state is clean

#### `make deps-info` - Dependency Audit
```bash
npm list --depth=0
```

**Critical for Aegis:**
- Shows versions of:
  - @anthropic-ai/sdk (LLM)
  - @coinbase/cdp-agentkit-core (execution)
  - @prisma/client (database)
  - viem (blockchain interaction)
  - redis (caching)

**Helps identify:**
- Outdated packages (security patches)
- Conflicting versions
- Missing dependencies

#### `make db-info` - Database Configuration
```
Database URL: postgres://...
Prisma Client installed: Yes
Prisma schema file: Found
```

**For Aegis operations:**
- Confirms database is configured
- Validates Prisma setup
- Helps troubleshoot connection issues

#### `make check-all` - Full Validation Pipeline
```bash
# Runs in sequence:
make lint          # Style check
make typecheck     # Type validation
make test          # All tests
```

**Pre-deployment checklist:**
```bash
make check-all     # Takes ~3-5 minutes
# If all pass: Safe to commit and push
```

#### `make check-preflight` - System Health Check
```bash
npm run check:preflight  # Validates system readiness
```

**Checks for Aegis:**
- Redis availability (for caching)
- PostgreSQL connection
- API keys loaded
- RPC endpoints reachable
- Agent tier contract accessible

#### `make check-redis` - Redis Connection
```bash
npm run check:redis
```

**For Aegis cache operations:**
- Confirms Redis is running
- Tests cache read/write
- Validates connection pool
- Measures latency

#### `make check-db` - Database Connection
```bash
npm run check:db
```

**For Aegis data layer:**
- Confirms PostgreSQL connectivity
- Tests query execution
- Verifies schema is present
- Checks permissions

---

### 7. CLEANUP & SETUP

#### `make clean` - Remove Build Artifacts
```bash
rm -rf node_modules .next dist coverage
```

**Use when:**
- Dependency issues arise (corrupted node_modules)
- Switching between branches
- Cleaning up disk space
- Fresh install needed

**Follow with:**
```bash
make install      # Reinstall dependencies
make typecheck    # Verify setup
```

#### `make install` - Install Dependencies
```bash
npm install
```

**For:**
- Initial setup
- After switching branches
- After `make clean`

---

## Workflow Examples

### Scenario 1: Developing New Tier Validation Logic

```bash
# 1. Start with clean slate
git checkout -b feature/new-tier-logic

# 2. Watch tests while developing
make test-watch

# 3. Edit tier validation
$EDITOR src/lib/agent/approved-agent-service.ts

# 4. Tests auto-run, showing failures
# Fix failures in real-time

# 5. When tests pass, full validation
make check-all

# 6. Commit and push
git add -A
git commit -m "Add new tier logic"
git push origin feature/new-tier-logic
```

### Scenario 2: Debugging Production Issues

```bash
# 1. Get environment info
make env-info

# 2. Check system health
make check-preflight
make check-db
make check-redis

# 3. View dependencies (check for issues)
make deps-info

# 4. Run agent in debug mode
make agent-run

# 5. Examine database
make db-studio

# 6. Check logs
# (Examine output from agent:run)
```

### Scenario 3: Preparing for Deployment

```bash
# 1. Update all dependencies
npm install

# 2. Run full validation
make check-all

# 3. Generate test coverage report
make test-coverage

# 4. Build for production
make build

# 5. Final system check
make check-preflight

# 6. Commit changes
git add -A
git commit -m "Production-ready: all checks pass"
git push origin claude/add-makefile-tests-TTgg5
```

### Scenario 4: Setting Up New Environment

```bash
# 1. Clone repository
git clone https://github.com/Officialhomie/aegis-agent.git
cd aegis-agent

# 2. Install dependencies
make install

# 3. Create .env file
cp field.env.template .env
# Edit .env with your API keys

# 4. Verify system
make check-preflight

# 5. Initialize database
make db-push
make db-seed

# 6. Run tests to verify
make test

# 7. Start development
make dev
```

---

## Makefile as Documentation

The `make help` command serves as living documentation:

```bash
make help
```

Shows all available commands with descriptions. This is valuable because:

1. **Discoverability:** New team members can see all available commands
2. **Consistency:** Commands are named predictably
3. **Self-documenting:** Descriptions in help correspond to actual usage
4. **Accessibility:** Single source of truth for operations

---

## Integration with Aegis Architecture

### OBSERVE Phase
- **Data source:** Blockchain (viem)
- **Testing:** `make test` validates observation parsing
- **Monitoring:** `make check-db` confirms data persistence

### REASON Phase
- **LLM:** Claude/GPT-4 via API
- **Testing:** Tests validate prompt formatting and response parsing
- **Debugging:** `make agent-dev` shows reasoning in real-time

### POLICY Phase
- **Rules:** Safety checks, tier validation, gas price limits
- **Testing:** `make test-coverage` ensures policy coverage
- **Verification:** `make check-all` validates policy enforcement

### EXECUTE Phase
- **Transaction building:** AgentKit + bundler
- **Sponsorship:** Paymaster logic (tested by `make test`)
- **Monitoring:** Dashboard accessible via `make dev`

### MEMORY Phase
- **Database:** PostgreSQL via Prisma
- **Vector DB:** Pinecone for similarity search
- **Management:** `make db-*` commands for schema/data management

---

## Summary: Makefile as Aegis Control Plane

| Component | Makefile Command | Purpose |
|-----------|------------------|---------|
| **Testing** | `make test*` | Verify OODA loop correctness |
| **Type Safety** | `make typecheck` | Catch errors before runtime |
| **Code Quality** | `make lint` | Enforce standards |
| **Database** | `make db-*` | Manage state and memory |
| **Development** | `make dev`, `make agent-dev` | Active development |
| **Monitoring** | `make check-*`, `make info` | Observability |
| **Deployment** | `make check-all`, `make build` | Production readiness |

The Makefile transforms Aegis from a complex multi-component system into a simple, discoverable, and reliable operational interface.

