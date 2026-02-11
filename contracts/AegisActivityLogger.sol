// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * Aegis Activity Logger - Onchain audit trail for autonomous paymaster decisions.
 *
 * Only the Aegis agent wallet can log. Events are immutable and verifiable.
 */
contract AegisActivityLogger {
    address public immutable aegisAgent;

    event Sponsorship(
        address indexed user,
        string protocolId,
        bytes32 decisionHash,
        uint256 estimatedCostUSD,
        uint256 timestamp,
        string metadata
    );

    event ReserveSwap(
        string tokenIn,
        string tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        bytes32 decisionHash,
        uint256 timestamp
    );

    event ProtocolAlert(
        string protocolId,
        string alertType,
        bytes32 decisionHash,
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

    /**
     * No-op callable by anyone. Used for sponsored UserOps where the sender needs
     * a valid target call that succeeds. CDP requires "valid calls in calldata";
     * empty calldata reverts here (no fallback), so we provide ping().
     */
    function ping() external {}

    function logSponsorship(
        address user,
        string calldata protocolId,
        bytes32 decisionHash,
        uint256 estimatedCostUSD,
        string calldata metadata
    ) external onlyAegis {
        emit Sponsorship(
            user,
            protocolId,
            decisionHash,
            estimatedCostUSD,
            block.timestamp,
            metadata
        );
    }

    function logReserveSwap(
        string calldata tokenIn,
        string calldata tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        bytes32 decisionHash
    ) external onlyAegis {
        emit ReserveSwap(
            tokenIn,
            tokenOut,
            amountIn,
            amountOut,
            decisionHash,
            block.timestamp
        );
    }

    function logProtocolAlert(
        string calldata protocolId,
        string calldata alertType,
        bytes32 decisionHash
    ) external onlyAegis {
        emit ProtocolAlert(
            protocolId,
            alertType,
            decisionHash,
            block.timestamp
        );
    }
}
