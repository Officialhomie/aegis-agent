// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../AegisAttestationLogger.sol";

contract AegisAttestationLoggerTest is Test {
    AegisAttestationLogger public logger;
    address public aegisAgent = address(0xAE615);
    address public stranger = address(0xBEEF);

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

    function setUp() public {
        logger = new AegisAttestationLogger(aegisAgent);
    }

    function test_constructor_setsAgent() public view {
        assertEq(logger.aegisAgent(), aegisAgent);
    }

    function test_constructor_rejectsZeroAddress() public {
        vm.expectRevert("Zero address");
        new AegisAttestationLogger(address(0));
    }

    function test_logPolicyDecision_emitsEvent() public {
        bytes32 hash = keccak256("decision1");
        vm.prank(aegisAgent);
        vm.expectEmit(true, false, false, true);
        emit PolicyDecision(address(0x1234), "SPONSOR_TRANSACTION", true, hash, "All rules passed", block.timestamp);
        logger.logPolicyDecision(address(0x1234), "SPONSOR_TRANSACTION", true, hash, "All rules passed");
    }

    function test_logPolicyDecision_rejection() public {
        bytes32 hash = keccak256("decision2");
        vm.prank(aegisAgent);
        vm.expectEmit(true, false, false, true);
        emit PolicyDecision(address(0x5678), "SPONSOR_TRANSACTION", false, hash, "EOA rejected", block.timestamp);
        logger.logPolicyDecision(address(0x5678), "SPONSOR_TRANSACTION", false, hash, "EOA rejected");
    }

    function test_logPolicyDecision_revertsNotAegis() public {
        vm.prank(stranger);
        vm.expectRevert(AegisAttestationLogger.NotAegis.selector);
        logger.logPolicyDecision(address(0x1234), "SPONSOR_TRANSACTION", true, bytes32(0), "test");
    }

    function test_heartbeat_emitsEvent() public {
        vm.prank(aegisAgent);
        vm.expectEmit(true, false, false, true);
        emit Heartbeat(aegisAgent, block.number, 100000000, 5, block.timestamp);
        logger.heartbeat(100000000, 5);
    }

    function test_heartbeat_revertsNotAegis() public {
        vm.prank(stranger);
        vm.expectRevert(AegisAttestationLogger.NotAegis.selector);
        logger.heartbeat(100000000, 5);
    }

    function test_logDiscovery_emitsEvent() public {
        vm.prank(aegisAgent);
        vm.expectEmit(true, false, false, true);
        emit AgentDiscovery(address(0xABCD), "ERC_4337", 2, block.timestamp);
        logger.logDiscovery(address(0xABCD), "ERC_4337", 2);
    }

    function test_logDiscovery_revertsNotAegis() public {
        vm.prank(stranger);
        vm.expectRevert(AegisAttestationLogger.NotAegis.selector);
        logger.logDiscovery(address(0xABCD), "ERC_4337", 2);
    }

    function test_logReputationUpdate_emitsEvent() public {
        bytes32 passportHash = keccak256("passport");
        vm.prank(aegisAgent);
        vm.expectEmit(true, false, false, true);
        emit ReputationUpdate(address(0x1234), 50, 9500, passportHash, block.timestamp);
        logger.logReputationUpdate(address(0x1234), 50, 9500, passportHash);
    }

    function test_logReputationUpdate_revertsNotAegis() public {
        vm.prank(stranger);
        vm.expectRevert(AegisAttestationLogger.NotAegis.selector);
        logger.logReputationUpdate(address(0x1234), 50, 9500, bytes32(0));
    }
}
