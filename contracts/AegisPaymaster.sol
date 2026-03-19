// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@account-abstraction/core/BasePaymaster.sol";
import "@account-abstraction/core/Helpers.sol";
import "@account-abstraction/interfaces/PackedUserOperation.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * Aegis Paymaster - Sovereign ERC-4337 paymaster owned by Aegis protocol.
 *
 * Aegis controls sponsorship policy off-chain via a signing key. The backend
 * evaluates policy rules (agent tier, budget, rate limits) and issues a
 * short-lived ECDSA approval embedded in paymasterAndData. This contract
 * verifies the approval on-chain — no budget storage, no external calls,
 * fully deterministic.
 *
 * paymasterAndData layout (after the 20-byte paymaster address):
 *   [0:6]    validUntil  (uint48, big-endian)
 *   [6:12]   validAfter  (uint48, big-endian)
 *   [12:13]  agentTier   (uint8: 1=ERC-8004, 2=ERC-4337, 3=other smart contract)
 *   [13:45]  approvalHash (bytes32)
 *   [45:110] signature   (bytes65, ECDSA over approvalHash)
 *
 * approvalHash = keccak256(abi.encode(
 *   sender, nonce, keccak256(callData),
 *   validUntil, validAfter, agentTier,
 *   address(this), block.chainid
 * ))
 */
contract AegisPaymaster is BasePaymaster {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // ============================================================================
    // Constants
    // ============================================================================

    uint256 private constant APPROVAL_OFFSET = PAYMASTER_DATA_OFFSET; // 52
    uint256 private constant VALID_UNTIL_OFFSET = APPROVAL_OFFSET;        // 52
    uint256 private constant VALID_AFTER_OFFSET = APPROVAL_OFFSET + 6;    // 58
    uint256 private constant AGENT_TIER_OFFSET = APPROVAL_OFFSET + 12;    // 64
    uint256 private constant APPROVAL_HASH_OFFSET = APPROVAL_OFFSET + 13; // 65
    uint256 private constant SIGNATURE_OFFSET = APPROVAL_OFFSET + 45;     // 97
    uint256 private constant PAYMASTER_DATA_LENGTH = 162; // 52 (prefix) + 6 + 6 + 1 + 32 + 65

    uint256 private constant SIG_FAILURE = 1;

    // ============================================================================
    // State
    // ============================================================================

    /// @notice Address of the backend signing key that issues approvals.
    address public immutable signingKey;

    /// @notice Replay protection: tracks used approval hashes.
    mapping(bytes32 => bool) public usedHashes;

    // ============================================================================
    // Events
    // ============================================================================

    event UserOpSponsored(
        address indexed sender,
        bytes32 indexed userOpHash,
        uint8 agentTier,
        uint256 actualGasCost
    );

    // ============================================================================
    // Constructor
    // ============================================================================

    constructor(IEntryPoint _entryPoint, address _signingKey) BasePaymaster(_entryPoint) {
        require(_signingKey != address(0), "AegisPaymaster: zero signing key");
        signingKey = _signingKey;
    }

    // ============================================================================
    // IPaymaster implementation
    // ============================================================================

    /**
     * Validate sponsorship eligibility.
     * Must be deterministic — no randomness, no external calls, no block.number.
     */
    function _validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) internal override returns (bytes memory context, uint256 validationData) {
        (maxCost); // unused, budget enforced off-chain

        bytes calldata paymasterData = userOp.paymasterAndData;
        require(paymasterData.length >= PAYMASTER_DATA_LENGTH, "AegisPaymaster: short paymasterAndData");

        // Decode fields
        uint48 validUntil = uint48(bytes6(paymasterData[VALID_UNTIL_OFFSET:VALID_UNTIL_OFFSET + 6]));
        uint48 validAfter = uint48(bytes6(paymasterData[VALID_AFTER_OFFSET:VALID_AFTER_OFFSET + 6]));
        uint8 agentTier = uint8(bytes1(paymasterData[AGENT_TIER_OFFSET:AGENT_TIER_OFFSET + 1]));
        bytes32 approvalHash = bytes32(paymasterData[APPROVAL_HASH_OFFSET:APPROVAL_HASH_OFFSET + 32]);
        bytes calldata signature = paymasterData[SIGNATURE_OFFSET:SIGNATURE_OFFSET + 65];

        // Agent tier: EOAs (tier 0) are never sponsored
        if (agentTier == 0) {
            return ("", SIG_FAILURE);
        }

        // Reconstruct and verify the approval hash
        bytes32 expectedHash = keccak256(
            abi.encode(
                userOp.sender,
                userOp.nonce,
                keccak256(userOp.callData),
                validUntil,
                validAfter,
                agentTier,
                address(this),
                block.chainid
            )
        );

        if (expectedHash != approvalHash) {
            return ("", SIG_FAILURE);
        }

        // Recover signer from ECDSA signature (EIP-191 prefixed).
        // Use tryRecover so malformed signatures return SIG_FAILURE instead of reverting.
        (address recovered, ECDSA.RecoverError err,) =
            approvalHash.toEthSignedMessageHash().tryRecover(signature);
        if (err != ECDSA.RecoverError.NoError || recovered != signingKey) {
            return ("", SIG_FAILURE);
        }

        // Replay protection: each approval hash can only be used once
        if (usedHashes[approvalHash]) {
            return ("", SIG_FAILURE);
        }
        usedHashes[approvalHash] = true;

        // Pass context to postOp
        context = abi.encode(userOp.sender, userOpHash, agentTier);

        // validationData encodes the time window; sigFailed = false
        validationData = _packValidationData(false, validUntil, validAfter);
    }

    /**
     * Post-operation hook: emit event for backend budget reconciliation.
     * The backend listens to UserOpSponsored and commits the spend record.
     */
    function _postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost,
        uint256 /*actualUserOpFeePerGas*/
    ) internal override {
        (mode); // handled the same way regardless of success/revert
        (address sender, bytes32 userOpHash, uint8 agentTier) =
            abi.decode(context, (address, bytes32, uint8));
        emit UserOpSponsored(sender, userOpHash, agentTier, actualGasCost);
    }

    // deposit(), withdrawTo(), getDeposit(), addStake(), unlockStake(), withdrawStake()
    // are all inherited from BasePaymaster.
}
