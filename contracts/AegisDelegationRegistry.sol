// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * Aegis Delegation Registry - On-chain audit trail for user-to-agent delegations.
 *
 * Primary delegation state is stored off-chain for fast paymaster validation.
 * This contract provides:
 * - Immutable audit trail via events
 * - Optional on-chain verification for high-value delegations
 * - EIP-712 signature verification
 */
contract AegisDelegationRegistry {
    // ============================================================================
    // Types
    // ============================================================================

    struct DelegationRecord {
        address delegator;
        address agent;
        bytes32 permissionsHash; // keccak256 of permissions JSON
        uint256 gasBudgetWei;
        uint256 validFrom;
        uint256 validUntil;
        bool revoked;
    }

    // ============================================================================
    // State
    // ============================================================================

    /// @notice Delegation records by ID
    mapping(bytes32 => DelegationRecord) public delegations;

    /// @notice Nonce per delegator for replay protection
    mapping(address => uint256) public nonces;

    /// @notice Aegis agent address (can log usage events)
    address public immutable aegisAgent;

    // ============================================================================
    // EIP-712
    // ============================================================================

    bytes32 public immutable DOMAIN_SEPARATOR;

    bytes32 public constant DELEGATION_TYPEHASH = keccak256(
        "Delegation(address delegator,address agent,bytes32 permissionsHash,uint256 gasBudgetWei,uint256 validFrom,uint256 validUntil,uint256 nonce)"
    );

    // ============================================================================
    // Events
    // ============================================================================

    event DelegationCreated(
        bytes32 indexed delegationId,
        address indexed delegator,
        address indexed agent,
        bytes32 permissionsHash,
        uint256 gasBudgetWei,
        uint256 validFrom,
        uint256 validUntil,
        uint256 timestamp
    );

    event DelegationRevoked(
        bytes32 indexed delegationId,
        address indexed delegator,
        string reason,
        uint256 timestamp
    );

    event DelegationUsed(
        bytes32 indexed delegationId,
        address indexed agent,
        address targetContract,
        uint256 gasUsed,
        bytes32 txHash,
        uint256 timestamp
    );

    // ============================================================================
    // Errors
    // ============================================================================

    error InvalidSignature();
    error DelegationExpired();
    error DelegationNotYetValid();
    error DelegationAlreadyRevoked();
    error NotDelegator();
    error NotAegis();
    error ZeroAddress();

    // ============================================================================
    // Modifiers
    // ============================================================================

    modifier onlyAegis() {
        if (msg.sender != aegisAgent) revert NotAegis();
        _;
    }

    // ============================================================================
    // Constructor
    // ============================================================================

    constructor(address _aegisAgent) {
        if (_aegisAgent == address(0)) revert ZeroAddress();
        aegisAgent = _aegisAgent;

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("AegisDelegation"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }

    // ============================================================================
    // External Functions
    // ============================================================================

    /**
     * @notice Create a new delegation with EIP-712 signature verification
     * @param agent The agent address receiving delegation
     * @param permissionsHash Hash of the permissions JSON
     * @param gasBudgetWei Gas budget in Wei
     * @param validFrom Start timestamp
     * @param validUntil End timestamp
     * @param v Signature v
     * @param r Signature r
     * @param s Signature s
     * @return delegationId The unique delegation identifier
     */
    function createDelegation(
        address agent,
        bytes32 permissionsHash,
        uint256 gasBudgetWei,
        uint256 validFrom,
        uint256 validUntil,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (bytes32 delegationId) {
        if (validUntil <= block.timestamp) revert DelegationExpired();
        if (validFrom > block.timestamp) revert DelegationNotYetValid();
        if (agent == address(0)) revert ZeroAddress();

        uint256 nonce = nonces[msg.sender]++;

        // Verify EIP-712 signature
        bytes32 structHash = keccak256(
            abi.encode(
                DELEGATION_TYPEHASH,
                msg.sender,
                agent,
                permissionsHash,
                gasBudgetWei,
                validFrom,
                validUntil,
                nonce
            )
        );

        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash)
        );

        address signer = ecrecover(digest, v, r, s);
        if (signer != msg.sender) revert InvalidSignature();

        // Generate delegation ID
        delegationId = keccak256(abi.encode(msg.sender, agent, nonce));

        // Store delegation record
        delegations[delegationId] = DelegationRecord({
            delegator: msg.sender,
            agent: agent,
            permissionsHash: permissionsHash,
            gasBudgetWei: gasBudgetWei,
            validFrom: validFrom,
            validUntil: validUntil,
            revoked: false
        });

        emit DelegationCreated(
            delegationId,
            msg.sender,
            agent,
            permissionsHash,
            gasBudgetWei,
            validFrom,
            validUntil,
            block.timestamp
        );
    }

    /**
     * @notice Revoke a delegation
     * @param delegationId The delegation to revoke
     * @param reason Human-readable revocation reason
     */
    function revokeDelegation(bytes32 delegationId, string calldata reason) external {
        DelegationRecord storage d = delegations[delegationId];
        if (d.delegator != msg.sender) revert NotDelegator();
        if (d.revoked) revert DelegationAlreadyRevoked();

        d.revoked = true;

        emit DelegationRevoked(delegationId, msg.sender, reason, block.timestamp);
    }

    /**
     * @notice Log delegation usage (called by Aegis agent after sponsorship)
     * @param delegationId The delegation used
     * @param targetContract Contract called
     * @param gasUsed Gas consumed
     * @param txHash Transaction hash
     */
    function logUsage(
        bytes32 delegationId,
        address targetContract,
        uint256 gasUsed,
        bytes32 txHash
    ) external onlyAegis {
        DelegationRecord storage d = delegations[delegationId];

        emit DelegationUsed(
            delegationId,
            d.agent,
            targetContract,
            gasUsed,
            txHash,
            block.timestamp
        );
    }

    // ============================================================================
    // View Functions
    // ============================================================================

    /**
     * @notice Check if a delegation is currently valid
     * @param delegationId The delegation to check
     * @return valid True if delegation is active and not expired
     */
    function isDelegationValid(bytes32 delegationId) external view returns (bool valid) {
        DelegationRecord storage d = delegations[delegationId];
        return !d.revoked &&
               d.validUntil > block.timestamp &&
               d.validFrom <= block.timestamp &&
               d.delegator != address(0);
    }

    /**
     * @notice Get delegation details
     * @param delegationId The delegation to query
     * @return delegator The delegator address
     * @return agent The agent address
     * @return permissionsHash Hash of permissions
     * @return gasBudgetWei Gas budget
     * @return validUntil Expiration timestamp
     * @return revoked Whether revoked
     */
    function getDelegation(bytes32 delegationId)
        external
        view
        returns (
            address delegator,
            address agent,
            bytes32 permissionsHash,
            uint256 gasBudgetWei,
            uint256 validUntil,
            bool revoked
        )
    {
        DelegationRecord storage d = delegations[delegationId];
        return (
            d.delegator,
            d.agent,
            d.permissionsHash,
            d.gasBudgetWei,
            d.validUntil,
            d.revoked
        );
    }

    /**
     * @notice Get current nonce for a delegator
     * @param delegator The delegator address
     * @return Current nonce value
     */
    function getNonce(address delegator) external view returns (uint256) {
        return nonces[delegator];
    }
}
