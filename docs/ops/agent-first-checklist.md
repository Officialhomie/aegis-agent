# Agent-First Operational Checklist
**Purpose**: Daily monitoring and management of agent-first execution guarantees

---

## 🎯 Quick Reference

### Tier System
| Tier | Type | Priority | Description |
|------|------|----------|-------------|
| **1** | ERC-8004 Agents | HIGHEST | Registered AI agents with on-chain identity |
| **2** | ERC-4337 Accounts | STANDARD | Account abstraction smart wallets |
| **3** | Smart Contracts | FALLBACK | Other smart contracts |
| **0** | EOAs | **REJECTED** | Externally owned accounts - NEVER sponsor |

### Gas Price Limits
- **MAX_GAS_PRICE_GWEI**: 2 gwei
- **Action**: UserOps with gas >= 2 gwei are REJECTED

---

## ✅ Daily Checklist

### Morning Checks (5 min)
```bash
# 1. Verify compliance
npx tsx scripts/verify-agent-first-compliance.ts

# 2. Check tier distribution
npx tsx scripts/check-tier-distribution.ts

# 3. View queue health
npx tsx -e "import('./src/lib/agent/queue/queue-analytics').then(m => m.printQueueReport())"
```

**Expected Results:**
- ✅ No tier 0 (EOA) records
- ✅ Queue prioritization working
- ✅ Gas price = 2 gwei
- ✅ No stale requests (>1 hour)

### Weekly Tasks (15 min)
```bash
# 1. Re-validate all agent tiers
npx tsx scripts/migrate-agent-tiers.ts --rescan

# 2. Clean up any EOA records
npx tsx scripts/cleanup-eoa-records.ts

# 3. Test gas price enforcement
npx tsx scripts/test-gas-price-validation.ts
```

### Monthly Review (30 min)
- Review tier distribution trends
- Analyze tier 3 wait times (check for starvation)
- Update protocol tier policies if needed
- Review OpenClaw command usage

---

## 🔧 OpenClaw Commands

### Tier Management
```
# Set minimum tier for protocol
set min tier to 1

# Prioritize specific agent
prioritize agent 0xabc... to 1

# Temporarily pause tier
pause tier 3 for 2 hours

# Resume paused tier
resume tier 3
```

### Monitoring
```
# View queue statistics
queue stats

# View tier distribution
tier report

# Check overall status
status
```

---

## 📊 Key Metrics to Monitor

### Queue Health
| Metric | Healthy | Warning | Critical |
|--------|---------|---------|----------|
| Stale requests (>1h) | 0 | 1-5 | >5 |
| Slow processing (>5min) | 0 | 1-3 | >3 |
| Tier 3 avg wait | <10min | 10-30min | >30min |

### Tier Distribution
| Metric | Typical Range |
|--------|---------------|
| Tier 1 % | 5-15% |
| Tier 2 % | 30-50% |
| Tier 3 % | 35-65% |
| Tier 0 (EOAs) | **0%** (always) |

### Gas Price
| Metric | Target |
|--------|--------|
| MAX_GAS_PRICE_GWEI | 2.0 |
| Current gas price | <2.0 (fluctuates) |
| Rejected UserOps | Logged when gas >= 2 |

---

## 🚨 Alert Conditions

### CRITICAL - Immediate Action Required
- ❌ **EOAs found in queue or database**
  - Action: Run `npx tsx scripts/cleanup-eoa-records.ts`
  - Investigate: How did EOAs bypass validation?

- ❌ **Queue prioritization broken**
  - Action: Check database indexes
  - Verify: `dequeueRequest()` implementation

- ❌ **Gas price > 2 gwei in sponsored tx**
  - Action: Check MAX_GAS_PRICE_GWEI env variable
  - Verify: sponsorship-rules.ts enforcement

### WARNING - Monitor Closely
- ⚠️ **Tier 3 wait time > 30 minutes**
  - Possible tier starvation
  - Consider: Adjust tier 1/2 flow rate

- ⚠️ **Queue depth > 100 items**
  - High demand or slow processing
  - Check: Processing worker health

- ⚠️ **No tier 1 requests in 24 hours**
  - ERC-8004 discovery may be down
  - Check: Identity Registry connectivity

---

## 🛠️ Troubleshooting

### Issue: EOAs appearing in queue
```bash
# 1. Check for EOAs
npx tsx scripts/verify-agent-first-compliance.ts

# 2. Clean up EOAs
npx tsx scripts/cleanup-eoa-records.ts

# 3. Verify validation
npx tsx -e "
  import('./src/lib/agent/validation/account-validator').then(m =>
    m.validateAccount('0x...')
  )
"
```

### Issue: Tier 1 not prioritized
```bash
# 1. Check queue ordering
npx tsx -e "
  import('./src/lib/agent/queue/queue-analytics').then(m =>
    m.printQueueReport()
  )
"

# 2. Verify database indexes
psql $DATABASE_URL -c "
  SELECT indexname, indexdef
  FROM pg_indexes
  WHERE tablename = 'QueueItem';
"

# 3. Test dequeue order
npx tsx -e "
  import('./src/lib/agent/queue/sponsorship-queue').then(m =>
    m.dequeueRequest()
  )
"
```

### Issue: Gas price not enforced
```bash
# 1. Check env variables
grep GAS_PRICE .env

# 2. Test validation
npx tsx scripts/test-gas-price-validation.ts

# 3. Check rule execution
# Review logs for "Gas price too high" rejections
```

---

## 📈 Performance Benchmarks

### Expected Performance
| Operation | Target | Acceptable | Slow |
|-----------|--------|------------|------|
| validateAccount() | <50ms | <100ms | >100ms |
| enqueueRequest() | <20ms | <50ms | >50ms |
| dequeueRequest() | <30ms | <100ms | >100ms |
| Tier classification (bulk) | <500ms/100 | <1s/100 | >1s/100 |

### Database Query Performance
```sql
-- Check slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE query LIKE '%QueueItem%'
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE tablename = 'QueueItem'
ORDER BY idx_scan;
```

---

## 🔄 Emergency Procedures

### Scenario 1: Tier System Malfunction
```bash
# 1. Pause all sponsorships
# Via OpenClaw: "pause"

# 2. Verify database state
npx tsx scripts/verify-agent-first-compliance.ts

# 3. Re-classify all accounts
npx tsx scripts/migrate-agent-tiers.ts --rescan

# 4. Test with dry run
AGENT_EXECUTION_MODE=SIMULATION npx tsx scripts/run-realtime-campaign.ts --limit 1

# 5. Resume if tests pass
# Via OpenClaw: "resume"
```

### Scenario 2: EOA Contamination
```bash
# 1. Immediate cleanup
npx tsx scripts/cleanup-eoa-records.ts

# 2. Audit validation points
# Check: account-validator.ts
# Check: sponsorship-queue.ts
# Check: API route validation

# 3. Add monitoring
# Set up alert for tier 0 records
```

### Scenario 3: Gas Price Spike
```bash
# 1. Verify current gas price
cast gas-price --rpc-url $RPC_URL_BASE

# 2. Check rejected count
# Review logs for "Gas price too high"

# 3. Adjust if needed (temporary)
# Via OpenClaw: "set gas cap to 5 gwei"

# 4. Restore default when spike ends
# Via OpenClaw: "set gas cap to 2 gwei"
```

---

## 📝 Logs to Monitor

### Key Log Patterns
```bash
# EOA rejections (should see these regularly)
grep "EOA rejected" logs/agent.log

# Tier assignment
grep "Tier distribution" logs/agent.log

# Queue prioritization
grep "tier-based priority" logs/agent.log

# Gas price rejections
grep "Gas price too high" logs/agent.log
```

### Log Locations
- **Agent logs**: `logs/agent.log`
- **Discovery logs**: `logs/discovery.log`
- **Queue logs**: `logs/queue.log`
- **Sponsorship logs**: `logs/sponsorship.log`

---

## 🎯 Success Criteria

### Daily Compliance ✅
- [ ] No tier 0 (EOA) records found
- [ ] Queue prioritization verified
- [ ] Gas price enforcement active
- [ ] No stale requests (>1 hour)
- [ ] Tier distribution within normal range

### Weekly Health ✅
- [ ] All agent tiers re-validated
- [ ] EOA cleanup completed
- [ ] Gas price tests passing
- [ ] Queue performance acceptable
- [ ] No critical alerts

### Monthly Review ✅
- [ ] Tier distribution analyzed
- [ ] Protocol policies reviewed
- [ ] OpenClaw command usage reviewed
- [ ] Performance benchmarks met
- [ ] Documentation updated

---

## 📞 Support & Escalation

### L1 Support (Operator)
- Daily checks
- OpenClaw commands
- Basic troubleshooting

### L2 Support (Engineer)
- Database queries
- Code-level debugging
- Performance tuning

### L3 Support (Architect)
- Tier system design changes
- Protocol policy updates
- Major refactoring

---

**Last Updated**: 2026-02-28
**Version**: 1.0
**Owner**: Aegis Operations Team
