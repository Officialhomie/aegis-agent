---
name: aegis-protocol-vetting
description: Security and risk assessment for protocols requesting sponsorship
version: 1.0.0
author: Aegis Team
tags: [security, protocol, vetting, risk]
---

# Protocol Vetting Skill

Evaluate protocol safety and trustworthiness before approving sponsorship.

## Risk Categories

### 🟢 LOW RISK (Approve)
- Established protocol (>6 months old)
- Verified contracts on Etherscan
- Large TVL (>$1M)
- Active community and audits

### 🟡 MEDIUM RISK (Review)
- New protocol (<6 months)
- Unverified contracts
- Small TVL (<$100k)
- Limited audit history

### 🔴 HIGH RISK (Reject)
- Anonymous team
- No contract verification
- Suspicious patterns (honeypot indicators)
- Recent security incidents

## Vetting Checklist

1. **Contract Verification**
   - [ ] All contracts verified on Etherscan
   - [ ] Source code matches deployment
   - [ ] No proxy upgrade risks

2. **Security Audit**
   - [ ] Audited by reputable firm (OpenZeppelin, Trail of Bits, Consensys)
   - [ ] Audit <12 months old
   - [ ] Critical issues resolved

3. **Financial Health**
   - [ ] TVL >$100k
   - [ ] Active daily volume
   - [ ] No suspicious drain events

4. **Reputation**
   - [ ] Known team or established DAO
   - [ ] Active GitHub/Discord
   - [ ] No scam reports

## Examples

### Example 1: Uniswap (LOW RISK)
- ✅ Verified contracts
- ✅ Multiple audits
- ✅ $4B+ TVL
- ✅ 4+ years operating
- **Decision:** APPROVE

### Example 2: New DEX (MEDIUM RISK)
- ✅ Verified contracts
- ⚠️ No audit
- ⚠️ $50k TVL
- ⚠️ 2 months old
- **Decision:** ESCALATE (manual review)

### Example 3: Anonymous Fork (HIGH RISK)
- ❌ Unverified contracts
- ❌ No audit
- ❌ Anonymous team
- ❌ Copied code
- **Decision:** REJECT

## Guidelines

1. Default to REJECT if any critical red flag
2. Escalate to manual review if unsure
3. Whitelist approved protocols for faster processing
4. Re-vet protocols every 6 months
