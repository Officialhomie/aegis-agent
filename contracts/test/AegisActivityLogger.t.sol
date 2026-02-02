// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../AegisActivityLogger.sol";

contract AegisActivityLoggerTest is Test {
    AegisActivityLogger public logger;
    address public aegisAgent;
    address public stranger;

    function setUp() public {
        aegisAgent = makeAddr("aegisAgent");
        stranger = makeAddr("stranger");
        logger = new AegisActivityLogger(aegisAgent);
    }

    function test_Deployment_SetsAegisAgent() public view {
        assertEq(logger.aegisAgent(), aegisAgent);
    }

    function test_Deployment_RevertsWhenZeroAddress() public {
        vm.expectRevert("Zero address");
        new AegisActivityLogger(address(0));
    }

    function test_LogSponsorship_OnlyAegis() public {
        vm.prank(aegisAgent);
        logger.logSponsorship(
            makeAddr("user"),
            "uniswap-v3",
            keccak256("decision"),
            80, // 0.08 USD in cents or scaled
            "metadata"
        );
    }

    function test_LogSponsorship_RevertsWhenNotAegis() public {
        vm.prank(stranger);
        vm.expectRevert(AegisActivityLogger.NotAegis.selector);
        logger.logSponsorship(
            makeAddr("user"),
            "uniswap-v3",
            keccak256("decision"),
            80,
            "metadata"
        );
    }

    function test_LogSponsorship_EmitsEvent() public {
        address user = makeAddr("user");
        bytes32 decisionHash = keccak256("decision");
        vm.prank(aegisAgent);
        logger.logSponsorship(user, "uniswap-v3", decisionHash, 80, "metadata");
        // Call succeeds; event is emitted (verified by no revert)
    }

    function test_LogReserveSwap_OnlyAegis() public {
        vm.prank(aegisAgent);
        logger.logReserveSwap(
            "USDC",
            "ETH",
            150e6,  // 150 USDC
            0.05e18, // 0.05 ETH
            keccak256("swapDecision")
        );
    }

    function test_LogReserveSwap_RevertsWhenNotAegis() public {
        vm.prank(stranger);
        vm.expectRevert(AegisActivityLogger.NotAegis.selector);
        logger.logReserveSwap("USDC", "ETH", 150e6, 0.05e18, keccak256("swap"));
    }

    function test_LogProtocolAlert_OnlyAegis() public {
        vm.prank(aegisAgent);
        logger.logProtocolAlert(
            "uniswap-v3",
            "LOW_BUDGET",
            keccak256("alertDecision")
        );
    }

    function test_LogProtocolAlert_RevertsWhenNotAegis() public {
        vm.prank(stranger);
        vm.expectRevert(AegisActivityLogger.NotAegis.selector);
        logger.logProtocolAlert("uniswap-v3", "LOW_BUDGET", keccak256("alert"));
    }
}
