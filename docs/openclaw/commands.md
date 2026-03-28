# OpenClaw Command Reference

OpenClaw is a natural language interface for protocol operators to manage their Aegis agent sponsorship programs via messaging platforms (WhatsApp, Telegram, Signal).

## Command Categories

- [Agent Management](#agent-management)
- [Protocol Management](#protocol-management)
- [Budget Management](#budget-management)
- [Guarantee Management](#guarantee-management)
- [Delegation Management](#delegation-management)
- [Heartbeat/Liveness](#heartbeatliveness)
- [Reports & Audit](#reports--audit)
- [Help & Safety](#help--safety)

---

## Agent Management

### Create Agent
Register a new approved agent for your protocol.

```
create agent 0xAgentAddress... name "My Trading Bot" type ERC8004_AGENT tier 2
```

**Parameters:**
- `address` - Agent's Ethereum address (required)
- `name` - Human-readable name in quotes (optional)
- `type` - Agent type: `ERC8004_AGENT`, `ERC4337_ACCOUNT`, `SMART_CONTRACT`, `EOA`
- `tier` - Agent tier level (1-5)

### Update Agent
Modify an existing agent's properties.

```
update agent 0xAgentAddress... set tier 3
update agent 0xAgentAddress... set name "Updated Bot Name"
```

### Delete Agent
Revoke an agent's approval (soft delete).

```
delete agent 0xAgentAddress...
```

**Note:** Requires confirmation for safety.

### Get Agent
View details of a specific agent.

```
get agent 0xAgentAddress...
show agent 0xAgentAddress...
```

### List Agents
List all approved agents for your protocol.

```
list agents
list agents active
list agents tier 2
```

---

## Protocol Management

### Create Protocol
Register a new protocol sponsor.

```
create protocol my-protocol budget $1000 min-tier 2
```

**Parameters:**
- `protocolId` - Unique protocol identifier (required)
- `budget` - Initial balance in USD
- `min-tier` - Minimum agent tier required

### Update Protocol
Modify protocol settings.

```
update protocol my-protocol set requireERC8004 true
update protocol my-protocol set minAgentTier 3
```

### Disable Protocol
Suspend a protocol (soft disable).

```
disable protocol my-protocol
```

**Note:** Requires confirmation for safety.

### Get Protocol
View protocol details and statistics.

```
get protocol my-protocol
show protocol my-protocol
```

### List Protocols
List all protocols (admin only).

```
list protocols
list protocols active
```

---

## Budget Management

### Top Up Budget
Add funds to your protocol's sponsorship budget.

```
topup budget my-protocol $500
topup protocol my-protocol $1000 via x402
```

**Payment Methods:**
- `manual` - Manual/administrative top-up
- `x402` - Via x402 payment protocol
- `crypto` - Direct crypto deposit
- `credit_card` - Credit card payment

### Set Daily Budget
Configure daily spending limits.

```
set daily budget my-protocol $100
daily limit my-protocol $50
```

Set to `$0` to remove the limit.

### Show Budget
View budget summary and history.

```
show budget my-protocol
show budget my-protocol history
```

---

## Guarantee Management

### Create Guarantee
Create an execution guarantee for an agent.

```
create guarantee my-protocol for 0xAgent... type GAS_BUDGET budget $100 duration 7d tier GOLD
```

**Guarantee Types:**
- `GAS_BUDGET` - Gas budget guarantee
- `TX_COUNT` - Transaction count guarantee
- `TIME_WINDOW` - Time-based guarantee

**Service Tiers:**
- `BRONZE` - Basic tier
- `SILVER` - Standard tier
- `GOLD` - Premium tier

### Cancel Guarantee
Cancel an active guarantee.

```
cancel guarantee clm123abc...
```

**Note:** Requires confirmation for safety.

### List Guarantees
List guarantees for your protocol or agent.

```
list guarantees my-protocol
list guarantees 0xAgent... active
list guarantees my-protocol expired
```

### Get Guarantee
View guarantee details.

```
get guarantee clm123abc...
show guarantee clm123abc...
```

---

## Delegation Management

### Create Delegation
Create a delegation from user to agent.

```
create delegation from 0xUser... to 0xAgent... max-value $50 duration 7d
```

**Note:** Returns unsigned EIP-712 payload. Actual signature must happen in user's wallet.

**Parameters:**
- `from` - Delegator address (required)
- `to` - Agent address (required)
- `max-value` - Maximum value per transaction
- `duration` - Delegation validity period

### Revoke Delegation
Revoke an active delegation.

```
revoke delegation clm456... 0xDelegator...
revoke delegation clm456... 0xDelegator... reason "Security concern"
```

**Note:** Requires confirmation for safety.

### List Delegations
List delegations for a user or agent.

```
list delegations 0xUser...
list delegations for 0xAgent... active
list delegations 0xAgent... all
```

### Get Delegation
View delegation details.

```
get delegation clm456...
get delegation clm456... usage
```

---

## Heartbeat/Liveness

### Start Heartbeat
Start heartbeat monitoring for an agent.

```
start heartbeat 0xAgent... every 15m
start heartbeat 0xAgent... every 1h
```

### Stop Heartbeat
Stop heartbeat monitoring.

```
stop heartbeat 0xAgent...
```

### Liveness Report
View agent liveness statistics.

```
liveness report 0xAgent...
liveness report 0xAgent... last 7 days
```

---

## Reports & Audit

### Export Sponsorships
Export sponsorship data.

```
export sponsorships my-protocol since 2026-02-01 format csv
export sponsorships my-protocol since 2026-01-01 format json
```

### Audit Log
View OpenClaw command history.

```
audit log my-protocol last 24h
audit log my-protocol last 48 hours
```

### Generate Report
Generate a protocol summary report.

```
generate report my-protocol summary
generate report my-protocol spending
generate report my-protocol activity
```

---

## Help & Safety

### Help
Get help on available commands.

```
help
help create agent
commands
```

### Confirm
Confirm a pending destructive action.

```
YES
confirm ABC123
CONFIRM
```

### Cancel
Cancel a pending confirmation.

```
NO
cancel
```

---

## Rate Limits

To prevent abuse, OpenClaw enforces rate limits:

- **60 commands per minute** per session
- **5 destructive commands per hour** per session

Destructive commands include:
- `delete_agent`
- `disable_protocol`
- `revoke_delegation`
- `cancel_guarantee`

---

## Session Context

Many commands can omit the protocol ID when you have an active session:

```
# With session context
show budget
list agents
generate report summary

# Without session context (protocol ID required)
show budget my-protocol
list agents my-protocol
generate report my-protocol summary
```

---

## Error Handling

Commands return structured responses:

**Success:**
```
Budget topped up successfully!

Protocol: my-protocol
Amount: $500.00
New Balance: $1500.00
Method: manual
Deposit ID: clm123abc...
```

**Error:**
```
Failed to top up budget: Protocol not found: unknown-protocol
```

---

## Natural Language Variations

OpenClaw supports natural language variations:

```
# These are equivalent:
create agent 0x123...
add agent 0x123...
new agent 0x123...

# These are equivalent:
delete agent 0x123...
remove agent 0x123...
revoke agent 0x123...

# These are equivalent:
show budget
get budget
budget status
my budget
```
