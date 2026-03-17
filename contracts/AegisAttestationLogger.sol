// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * Aegis Attestation Logger - Onchain attestations for policy decisions, heartbeats, and discovery.
 *
 * Complements AegisActivityLogger (sponsorship events) with broader agent lifecycle events.
 * Only the Aegis agent wallet can log. Events are immutable and verifiable.
 */
contract AegisAttestationLogger {
    address public immutable aegisAgent;

    event PolicyDecision(
        address indexed agent,
        string action,
        bool approved,
        bytes32 decisionHash,
        string reason,
        uint256 timestamp
    );

    event Heartbeat(
        address indexed agent,
        uint256 blockNumber,
        uint256 gasPrice,
        uint256 activeProtocols,
        uint256 timestamp
    );

    event AgentDiscovery(
        address indexed discovered,
        string accountType,
        uint8 tier,
        uint256 timestamp
    );

    event ReputationUpdate(
        address indexed agent,
        uint256 sponsorCount,
        uint256 successRateBps,
        bytes32 passportHash,
        uint256 timestamp
    );

    error NotAegis();

    modifier onlyAegis() {
        if (msg.sender != aegisAgent) revert NotAegis();
        _;
    }

    constructor(address _aegisAgent) {
        require(_aegisAgent != address(0), "Zero address");
        aegisAgent = _aegisAgent;
    }

    function logPolicyDecision(
        address agent,
        string calldata action,
        bool approved,
        bytes32 decisionHash,
        string calldata reason
    ) external onlyAegis {
        emit PolicyDecision(agent, action, approved, decisionHash, reason, block.timestamp);
    }

    function heartbeat(
        uint256 gasPrice,
        uint256 activeProtocols
    ) external onlyAegis {
        emit Heartbeat(msg.sender, block.number, gasPrice, activeProtocols, block.timestamp);
    }

    function logDiscovery(
        address discovered,
        string calldata accountType,
        uint8 tier
    ) external onlyAegis {
        emit AgentDiscovery(discovered, accountType, tier, block.timestamp);
    }

    function logReputationUpdate(
        address agent,
        uint256 sponsorCount,
        uint256 successRateBps,
        bytes32 passportHash
    ) external onlyAegis {
        emit ReputationUpdate(agent, sponsorCount, successRateBps, passportHash, block.timestamp);
    }
}
