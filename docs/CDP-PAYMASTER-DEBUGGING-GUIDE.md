# CDP Paymaster & Coinbase Smart Wallet Integration Guide

## Complete Debugging Journey & Implementation Reference

**Date:** February 2025
**Project:** Aegis Agent - Gas Sponsorship System
**Outcome:** Successfully executed sponsored transaction on Base mainnet

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Problem Statement](#problem-statement)
3. [Investigation Timeline](#investigation-timeline)
4. [Root Causes Discovered](#root-causes-discovered)
5. [The Working Solution](#the-working-solution)
6. [ERC-4337 Technical Deep Dive](#erc-4337-technical-deep-dive)
7. [Coinbase Smart Wallet Specifics](#coinbase-smart-wallet-specifics)
8. [CDP Paymaster Integration](#cdp-paymaster-integration)
9. [Code Patterns: What Works vs What Doesn't](#code-patterns-what-works-vs-what-doesnt)
10. [Implementation Checklist](#implementation-checklist)
11. [Feedback for CDP Discord](#feedback-for-cdp-discord)
12. [Appendix: Test Scripts](#appendix-test-scripts)

---

## Executive Summary

### The Goal
Execute a **gas-sponsored transaction** on Base mainnet using:
- **Coinbase Smart Wallet** (ERC-4337 smart account)
- **CDP Paymaster** (Coinbase Developer Platform gas sponsorship)
- **Agent's Keystore** (EOA owner of the smart wallet)

### The Result
**SUCCESS** - Transaction verified on Basescan. For the latest recorded run (2026-02-11), see **[TEST_REPORT.md](./TEST_REPORT.md#run-c--successful-sponsored-transaction-2026-02-11)**.

Example successful run:
- **Transaction Hash:** `0x2e5a6192797ac1b2b3cb1bdb4395c1751ccfed56938849a7e3863dc4e399ad45` ([Basescan](https://basescan.org/tx/0x2e5a6192797ac1b2b3cb1bdb4395c1751ccfed56938849a7e3863dc4e399ad45))
- **UserOp Hash:** `0x863e3f6fd1bdcfb993fccde500497d61e8fc044e6ed900cb515c990ff4bd55fa`
- **Smart Wallet:** `0x32dbb81174ecFbac83D30a9D36cEba7Ebf4Ae97f`
- **Owner EOA:** `0x7B9763b416F89aB9A2468d8E9f041C4542B5612f`

### Key Insight
**Use viem's `toCoinbaseSmartAccount`** - it handles all the complex signature formatting internally. Manual UserOperation building fails due to subtle signature encoding differences.

---

## Problem Statement

### Initial Error
```
ERROR: request denied - simulation had no valid calls in calldata
```

### Investigation Revealed Multiple Issues
1. **Zero gas limits** - `verificationGasLimit` and `preVerificationGas` were `0x0`
2. **Wrong EntryPoint version** - Using v0.7 instead of v0.6 for Coinbase Smart Wallet
3. **Contracts not on allowlist** - ActivityLogger needed to be added to CDP Portal
4. **Signature validation failures** - Manual signature encoding didn't match what the smart wallet expected

### Error Progression
```
1. "simulation had no valid calls" → Fixed gas limits
2. "max sponsorship cost exceeded" → Used realistic Base gas prices
3. "Invalid user operation for entry point" → Switched to EntryPoint v0.6
4. "AA23 reverted (or OOG)" → Signature format issue
5. "Invalid UserOp signature or paymaster signature" → Needed toCoinbaseSmartAccount
```

---

## Investigation Timeline

### Phase 1: Zero Gas Limits
**Problem:** CDP paymaster returned error about "no valid calls in calldata"

**Discovery:** The `getPaymasterStubData` call was receiving:
```json
{
  "verificationGasLimit": "0x0",
  "preVerificationGas": "0x0"
}
```

**Fix:** Estimate gas BEFORE requesting paymaster data:
```typescript
// Step 1: Estimate gas
const gasEstimate = await estimateUserOpGas({...});

// Step 2: Pass non-zero values to paymaster
const stub = await getPaymasterStubData(paymasterClient, {
  verificationGasLimit: gasEstimate.verificationGasLimit,
  preVerificationGas: gasEstimate.preVerificationGas,
  // ...
});
```

### Phase 2: EntryPoint Version Mismatch
**Problem:** "Invalid user operation for entry point"

**Discovery:** Coinbase Smart Wallets use **EntryPoint v0.6**, but code defaulted to v0.7.

| EntryPoint Version | Address | Used By |
|-------------------|---------|---------|
| v0.6 | `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` | Coinbase Smart Wallet |
| v0.7 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` | Newer implementations |

**Fix:** Changed default in `bundler-client.ts`:
```typescript
import { entryPoint06Address } from 'viem/account-abstraction';

export function getEntryPointAddress(): Address {
  return process.env.ENTRY_POINT_ADDRESS || entryPoint06Address;
}
```

### Phase 3: CDP Allowlist Configuration
**Problem:** Paymaster rejected calls to ActivityLogger

**Discovery:** CDP Paymaster only sponsors calls to **allowlisted contracts**.

**Fix:** Added to CDP Portal (portal.cdp.coinbase.com):
1. ActivityLogger contract address
2. Smart Wallet contract address (as sender)

### Phase 4: Ownership Issue
**Problem:** Tried using a smart wallet we didn't own

**Discovery:** The test wallet `0xbdA97b283f9C93C1EA025b6240f299D81E6c0823` wasn't owned by our agent's keystore.

**Fix:** Created a NEW smart wallet with our agent as owner:
```typescript
// create-smart-wallet.ts
const ownerBytes = '0x000000000000000000000000' + account.address.slice(2);
const hash = await walletClient.writeContract({
  address: SMART_WALLET_FACTORY,
  functionName: 'createAccount',
  args: [[ownerBytes], nonce],
});
```

**Result:** New wallet `0x32dbb81174ecFbac83D30a9D36cEba7Ebf4Ae97f` owned by agent.

### Phase 5: Signature Validation Failures
**Problem:** "AA23 reverted" then "Invalid UserOp signature"

**Discovery:** Coinbase Smart Wallet uses a **specific EIP-712 signature format**:

1. **MESSAGE_TYPEHASH:** `keccak256("CoinbaseSmartWalletMessage(bytes32 hash)")`
2. **Domain:** `{name: "Coinbase Smart Wallet", version: "1", chainId, verifyingContract}`
3. **Signature Wrapper:** `abi.encode(uint256 ownerIndex, bytes signatureData)`

**Manual attempts that FAILED:**
```typescript
// Attempt 1: Sign raw userOpHash - FAILED
const sig = await account.signMessage({ message: { raw: userOpHash } });

// Attempt 2: Manual EIP-712 hash - FAILED
const hashToSign = keccak256(concat(['0x1901', domainSeparator, structHash]));
const sig = await account.signMessage({ message: { raw: hashToSign } });

// Attempt 3: signTypedData - Still FAILED
const sig = await account.signTypedData({
  domain: {...},
  types: { CoinbaseSmartWalletMessage: [...] },
  message: { hash: userOpHash },
});
```

**Root Cause:** Even with correct EIP-712 signing, the full UserOperation encoding through the bundler had subtle differences that viem's internal implementation handles correctly.

### Phase 6: The Working Solution
**Solution:** Use viem's built-in `toCoinbaseSmartAccount`:

```typescript
import { toCoinbaseSmartAccount } from 'viem/account-abstraction';

const smartAccount = await toCoinbaseSmartAccount({
  client: publicClient,
  owners: [ownerAccount],
  address: smartWalletAddress,
});

const bundlerClient = createBundlerClient({
  account: smartAccount,
  client: publicClient,
  transport: http(bundlerRpcUrl),
  paymaster: createPaymasterClient({
    transport: http(bundlerRpcUrl),
  }),
});

const userOpHash = await bundlerClient.sendUserOperation({
  calls: [{ to: targetAddress, data: callData, value: 0n }],
});
```

**Why this works:** `toCoinbaseSmartAccount` internally:
1. Computes correct EIP-712 domain separator
2. Wraps userOpHash with MESSAGE_TYPEHASH
3. Signs with proper format
4. Encodes SignatureWrapper struct correctly
5. Handles all v0.6 UserOperation specifics

---

## Root Causes Discovered

### 1. Gas Estimation Order
**Wrong:** Request paymaster data → Get zero gas limits → Simulation fails
**Right:** Estimate gas → Request paymaster data with real values → Success

### 2. EntryPoint Version
**Wrong:** Default to v0.7 (latest) for all smart accounts
**Right:** Use v0.6 specifically for Coinbase Smart Wallet

### 3. Signature Encoding Complexity
Coinbase Smart Wallet signature verification:
```solidity
function _validateSignature(bytes32 message, bytes calldata signature) {
    SignatureWrapper memory sigWrapper = abi.decode(signature, (SignatureWrapper));
    bytes memory ownerBytes = ownerAtIndex(sigWrapper.ownerIndex);
    address owner = address(uint160(uint256(bytes32(ownerBytes))));
    return SignatureCheckerLib.isValidSignatureNow(
        owner,
        _hashStruct(message),  // EIP-712 wrapping happens HERE
        sigWrapper.signatureData
    );
}

function _hashStruct(bytes32 hash) returns (bytes32) {
    bytes32 _hash = keccak256(abi.encode(MESSAGE_TYPEHASH, hash));
    return keccak256(abi.encodePacked("\x19\x01", _domainSeparator(), _hash));
}
```

The signature must be over the FINAL EIP-712 hash, and the encoding must be exact.

### 4. Stub vs Real Paymaster Data
**`getPaymasterStubData`** - For gas estimation only (signature may be placeholder)
**`getPaymasterData`** - For actual submission (contains valid paymaster signature)

However, using `createBundlerClient` with `paymaster` option handles this automatically.

---

## The Working Solution

### Complete Working Code
```typescript
import { createPublicClient, http, encodeFunctionData } from 'viem';
import { base } from 'viem/chains';
import {
  createBundlerClient,
  createPaymasterClient,
  toCoinbaseSmartAccount,
} from 'viem/account-abstraction';

async function executeSponsoredTransaction() {
  // 1. Create public client
  const publicClient = createPublicClient({
    chain: base,
    transport: http(process.env.BASE_RPC_URL),
  });

  // 2. Load owner account (your EOA that owns the smart wallet)
  const ownerAccount = await getYourOwnerAccount(); // Keystore, private key, etc.

  // 3. Create Coinbase Smart Account
  const smartAccount = await toCoinbaseSmartAccount({
    client: publicClient,
    owners: [ownerAccount],
    address: '0xYourSmartWalletAddress',
  });

  // 4. Create bundler client WITH paymaster
  const bundlerClient = createBundlerClient({
    account: smartAccount,
    client: publicClient,
    transport: http(process.env.COINBASE_BUNDLER_RPC_URL),
    paymaster: createPaymasterClient({
      transport: http(process.env.COINBASE_BUNDLER_RPC_URL),
    }),
  });

  // 5. Send sponsored UserOperation
  const userOpHash = await bundlerClient.sendUserOperation({
    calls: [
      {
        to: '0xTargetContract',
        data: encodeFunctionData({ abi: [...], functionName: '...', args: [...] }),
        value: 0n,
      },
    ],
  });

  // 6. Wait for confirmation
  const receipt = await bundlerClient.waitForUserOperationReceipt({
    hash: userOpHash,
    timeout: 120000,
  });

  console.log('Transaction Hash:', receipt.receipt.transactionHash);
}
```

### Key Dependencies
```json
{
  "viem": "^2.45.0"
}
```

### Required Environment Variables
```bash
# RPC endpoint for reading chain state
BASE_RPC_URL="https://mainnet.base.org"

# CDP Bundler/Paymaster endpoint (same URL for both)
COINBASE_BUNDLER_RPC_URL="https://api.developer.coinbase.com/rpc/v1/base/YOUR_API_KEY"

# Your deployed smart wallet address
SMART_WALLET_ADDRESS="0x..."

# Contract to call (must be on CDP allowlist)
ACTIVITY_LOGGER_ADDRESS="0x..."
```

---

## ERC-4337 Technical Deep Dive

### Architecture Overview
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   User/     │────▶│   Bundler   │────▶│  EntryPoint │
│   dApp      │     │   (CDP)     │     │  Contract   │
└─────────────┘     └─────────────┘     └─────────────┘
                           │                    │
                           ▼                    ▼
                    ┌─────────────┐     ┌─────────────┐
                    │  Paymaster  │     │   Smart     │
                    │   (CDP)     │     │   Account   │
                    └─────────────┘     └─────────────┘
```

### UserOperation Structure (v0.6)
```typescript
interface UserOperation {
  sender: Address;           // Smart account address
  nonce: bigint;            // Replay protection
  initCode: Hex;            // Factory call if deploying (empty if exists)
  callData: Hex;            // What to execute
  callGasLimit: bigint;     // Gas for execution
  verificationGasLimit: bigint;  // Gas for validation
  preVerificationGas: bigint;    // Gas for bundler overhead
  maxFeePerGas: bigint;     // EIP-1559 max fee
  maxPriorityFeePerGas: bigint;  // EIP-1559 priority fee
  paymasterAndData: Hex;    // Paymaster address + data
  signature: Hex;           // Smart account signature
}
```

### UserOperation Hash Calculation
```typescript
// v0.6 hash calculation
const packUserOp = keccak256(abi.encode(
  sender,
  nonce,
  keccak256(initCode),
  keccak256(callData),
  callGasLimit,
  verificationGasLimit,
  preVerificationGas,
  maxFeePerGas,
  maxPriorityFeePerGas,
  keccak256(paymasterAndData)
));

const userOpHash = keccak256(abi.encode(
  packUserOp,
  entryPointAddress,
  chainId
));
```

### Validation Flow
```
1. Bundler receives UserOp
2. Bundler calls EntryPoint.simulateValidation(userOp)
3. EntryPoint calls SmartAccount.validateUserOp(userOp, userOpHash, missingFunds)
4. SmartAccount verifies signature over userOpHash
5. If paymaster: EntryPoint calls Paymaster.validatePaymasterUserOp(...)
6. Paymaster verifies its signature and approves sponsorship
7. Bundler submits to mempool
8. EntryPoint executes: SmartAccount.execute(callData)
```

### ERC-4337 Error Codes
| Code | Meaning | Common Cause |
|------|---------|--------------|
| AA10 | Sender already constructed | initCode provided for existing account |
| AA13 | initCode failed | Factory deployment reverted |
| AA21 | Didn't pay prefund | Insufficient funds and no paymaster |
| AA23 | Reverted in validation | Signature verification failed |
| AA24 | Signature error | Wrong signature format |
| AA25 | Invalid signature | Signature doesn't match expected signer |
| AA31 | Paymaster deposit too low | Paymaster out of funds |
| AA33 | Paymaster validation reverted | Paymaster rejected operation |
| AA34 | Paymaster signature error | Invalid paymaster signature |

---

## Coinbase Smart Wallet Specifics

### Contract Addresses
| Contract | Base Mainnet |
|----------|--------------|
| Smart Wallet Factory | `0x0BA5ED0c6AA8c49038F819E587E2633c4A9F428a` |
| EntryPoint v0.6 | `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` |
| CDP Paymaster | `0x2faeb0760d4230ef2ac21496bb4f0b47d634fd4c` |

### Owner Encoding
For EOA owners, the owner is stored as 32 bytes (address padded):
```typescript
// Encoding owner for factory
const ownerBytes = '0x000000000000000000000000' + address.slice(2).toLowerCase();
```

### Signature Format
```solidity
struct SignatureWrapper {
    uint256 ownerIndex;    // Index in owners array (0 for single owner)
    bytes signatureData;   // The actual ECDSA signature
}

// ABI encoded: abi.encode(SignatureWrapper)
// NOT abi.encodePacked!
```

### EIP-712 Domain
```typescript
const domain = {
  name: 'Coinbase Smart Wallet',
  version: '1',
  chainId: 8453,  // Base mainnet
  verifyingContract: smartWalletAddress,
};

const types = {
  CoinbaseSmartWalletMessage: [
    { name: 'hash', type: 'bytes32' },
  ],
};

// Sign the userOpHash wrapped in this structure
const message = { hash: userOpHash };
```

### Signature Verification Flow
```
1. userOpHash comes from EntryPoint
2. Smart wallet computes structHash = keccak256(abi.encode(MESSAGE_TYPEHASH, userOpHash))
3. Smart wallet computes finalHash = keccak256("\x19\x01" || domainSeparator || structHash)
4. ecrecover(finalHash, signature) must equal registered owner
```

---

## CDP Paymaster Integration

### Endpoint
```
https://api.developer.coinbase.com/rpc/v1/base/YOUR_API_KEY
```

This single endpoint serves:
- Bundler RPC (eth_sendUserOperation, eth_getUserOperationReceipt)
- Paymaster RPC (pm_getPaymasterStubData, pm_getPaymasterData)

### Required Portal Configuration
1. **Enable Paymaster** in CDP Portal → Onchain Tools → Paymaster
2. **Allowlist Contracts** that can be called
3. **Allowlist Sender Wallets** (smart accounts that can use sponsorship)
4. **Set Policy Limits** (per-tx, per-user, global caps)

### Sponsorship Conditions
CDP Paymaster will ONLY sponsor if:
- Network is **Base or Base Sepolia** (not other chains)
- Sender is a **Smart Account** (not EOA)
- Target contract is **allowlisted**
- Transaction cost is within **policy limits**
- Paymaster has sufficient **deposited funds**

### paymasterAndData Format
```
[20 bytes] paymaster address
[6 bytes]  validUntil timestamp
[6 bytes]  validAfter timestamp
[32 bytes] policy/sponsor ID
[2 bytes]  flags
[65 bytes] paymaster signature
```

---

## Code Patterns: What Works vs What Doesn't

### WORKS: Using toCoinbaseSmartAccount
```typescript
const smartAccount = await toCoinbaseSmartAccount({
  client: publicClient,
  owners: [ownerAccount],
  address: smartWalletAddress,
});

const bundlerClient = createBundlerClient({
  account: smartAccount,
  paymaster: createPaymasterClient({ transport: http(bundlerRpcUrl) }),
  // ...
});

await bundlerClient.sendUserOperation({ calls: [...] });
```

### DOESN'T WORK: Manual UserOp Building
```typescript
// This approach fails with signature errors
const userOp = {
  sender: smartWalletAddress,
  nonce,
  callData,
  // ... manually building all fields
};

const userOpHash = getUserOperationHash({ userOperation: userOp, ... });
const signature = await account.signTypedData({...});
userOp.signature = encodeAbiParameters(['uint256', 'bytes'], [0n, signature]);

await bundlerClient.request({
  method: 'eth_sendUserOperation',
  params: [userOp, entryPoint],
}); // FAILS!
```

### DOESN'T WORK: Wrong EntryPoint Version
```typescript
// v0.7 doesn't work with Coinbase Smart Wallet
import { entryPoint07Address } from 'viem/account-abstraction';
// Use entryPoint06Address instead!
```

### DOESN'T WORK: Zero Gas Limits
```typescript
// Missing gas limits causes simulation failure
await getPaymasterStubData(client, {
  // verificationGasLimit: undefined -> becomes 0x0
  // preVerificationGas: undefined -> becomes 0x0
});
```

---

## Implementation Checklist

### Prerequisites
- [ ] CDP Account with API key
- [ ] Paymaster enabled in CDP Portal
- [ ] Target contracts added to allowlist
- [ ] Sender smart wallet on allowlist
- [ ] viem >= 2.45.0 installed

### Smart Wallet Setup
- [ ] Identify or create Coinbase Smart Wallet
- [ ] Verify wallet is deployed (has bytecode)
- [ ] Verify your EOA is registered as owner
- [ ] Note the wallet address

### Code Implementation
- [ ] Use `toCoinbaseSmartAccount` (not manual building)
- [ ] Use `createBundlerClient` with `paymaster` option
- [ ] Use `sendUserOperation` with `calls` array
- [ ] Use `waitForUserOperationReceipt` for confirmation

### Environment Setup
- [ ] `BASE_RPC_URL` - Public RPC endpoint
- [ ] `COINBASE_BUNDLER_RPC_URL` - CDP API endpoint
- [ ] `SMART_WALLET_ADDRESS` - Your smart wallet
- [ ] Target contract addresses in env

### Testing
- [ ] Run test script to verify sponsorship works
- [ ] Check transaction on Basescan
- [ ] Monitor CDP Portal for usage

---

## Feedback for CDP Discord

### Summary for Discord Mod

**Problems Encountered:**

1. **Zero Gas Limits in Paymaster Request**
   - `pm_getPaymasterStubData` was receiving `verificationGasLimit: 0x0` and `preVerificationGas: 0x0`
   - Caused "simulation had no valid calls in calldata" error
   - **Fix:** Estimate gas BEFORE calling paymaster endpoint

2. **EntryPoint Version Mismatch**
   - Documentation didn't clearly specify v0.6 requirement for Coinbase Smart Wallet
   - Using v0.7 caused "Invalid user operation for entry point"
   - **Fix:** Explicitly use `entryPoint06Address`

3. **Signature Encoding Complexity**
   - Coinbase Smart Wallet's EIP-712 signature format is complex
   - Manual implementation kept failing with "Invalid UserOp signature"
   - Even with correct EIP-712 domain/types, submission failed
   - **Fix:** Use viem's `toCoinbaseSmartAccount` which handles everything internally

**What Worked:**
- Using viem's built-in `toCoinbaseSmartAccount` function
- Combining bundler + paymaster through `createBundlerClient` with `paymaster` option
- Using `sendUserOperation` with `calls` array instead of manual UserOp building

**Suggestions for CDP Documentation:**
1. Add clear note that Coinbase Smart Wallet requires EntryPoint v0.6
2. Recommend using `toCoinbaseSmartAccount` from viem
3. Add complete working code example (not just fragments)
4. Clarify that gas estimation must happen BEFORE paymaster data request
5. Document the exact signature format expected

**Successful Transaction:**
- Hash: `0x259c90547ce262962851a10ef17a88866772799a3d73565338c604ff1acff846`
- Basescan: https://basescan.org/tx/0x259c90547ce262962851a10ef17a88866772799a3d73565338c604ff1acff846

---

## Appendix: Test Scripts

### Create Smart Wallet
```bash
npx tsx scripts/create-smart-wallet.ts
```
Creates a new Coinbase Smart Wallet with your keystore EOA as owner.

### Verify Owner Registration
```bash
npx tsx scripts/verify-smart-wallet-owner.ts
```
Confirms the owner is correctly registered in the smart wallet.

### Test Sponsored Transaction
```bash
npx tsx scripts/test-sponsored-tx-v2.ts
```
Executes a real sponsored transaction using the working pattern.

### Run Sponsorship Cycle
```bash
npx tsx scripts/run-one-sponsorship-cycle.ts
```
Full E2E test that mimics production sponsorship flow.

---

## Files Modified During Investigation

| File | Change |
|------|--------|
| `src/lib/agent/execute/bundler-client.ts` | Changed default EntryPoint to v0.6 |
| `src/lib/agent/execute/paymaster.ts` | Added gas estimation before paymaster request |
| `scripts/run-one-sponsorship-cycle.ts` | Rewrote to use toCoinbaseSmartAccount |
| `.env` | Added SMART_WALLET_ADDRESS |

---

## Quick Reference Card

```
COINBASE SMART WALLET + CDP PAYMASTER CHECKLIST

1. Use EntryPoint v0.6: 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789
2. Use viem's toCoinbaseSmartAccount (don't build UserOps manually)
3. Add contracts to CDP Portal allowlist
4. Add smart wallet to CDP Portal allowlist
5. Same URL for bundler and paymaster
6. Use sendUserOperation with calls array
7. Wait with waitForUserOperationReceipt

COMMON ERRORS:
- "no valid calls" → Check gas limits, check allowlist
- "Invalid user operation" → Check EntryPoint version
- "AA23/AA24/AA25" → Signature issue, use toCoinbaseSmartAccount
- "AA33/AA34" → Paymaster issue, check allowlist/limits
```

---

*Document created during debugging session, February 2025*
*Successfully resolved after ~6 hours of investigation*
