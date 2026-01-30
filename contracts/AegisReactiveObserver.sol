// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * Aegis Reactive Observer - Reactive Network Integration
 *
 * Placeholder for Reactive Smart Contract that subscribes to treasury events
 * and triggers the Aegis agent via webhook when events occur.
 *
 * When deploying on Reactive Network:
 * - Subscribe to BalanceChanged, ProposalCreated, Transfer on target chains
 * - On react(), call Aegis webhook with event data
 *
 * See: https://docs.reactive.network
 */
contract AegisReactiveObserver {
    address public owner;
    string public aegisWebhookUrl;

    event Subscribed(uint256 chainId, address indexed target, string eventName);
    event Reacted(uint256 chainId, string eventName, bytes eventData);

    constructor(string memory _aegisWebhookUrl) {
        owner = msg.sender;
        aegisWebhookUrl = _aegisWebhookUrl;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    function setWebhookUrl(string calldata _url) external onlyOwner {
        aegisWebhookUrl = _url;
    }

    /**
     * Subscribe to treasury/contract events on a chain.
     * Actual subscription is handled by Reactive Network runtime.
     */
    function subscribeToTreasuryEvents(
        uint256 chainId,
        address treasuryContract
    ) external onlyOwner {
        // Reactive Network: reactive.subscribe(chainId, treasuryContract, "BalanceChanged");
        // Reactive Network: reactive.subscribe(chainId, treasuryContract, "ProposalCreated");
        emit Subscribed(chainId, treasuryContract, "BalanceChanged");
        emit Subscribed(chainId, treasuryContract, "ProposalCreated");
    }

    /**
     * Called by Reactive Network when a subscribed event occurs.
     * Off-chain: Aegis backend receives eventData and runs agent cycle.
     */
    function react(bytes calldata eventData) external {
        // In production: verify caller is Reactive Network runtime
        // Off-chain indexer or oracle calls aegisWebhookUrl with eventData
        emit Reacted(block.chainid, "reactive", eventData);
    }
}
