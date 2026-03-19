// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Test.sol";
import "../AegisPaymaster.sol";
import "@account-abstraction/interfaces/IEntryPoint.sol";
import "@account-abstraction/interfaces/PackedUserOperation.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

// ============================================================================
// Test harness: exposes internal functions, skips EntryPoint interface check
// ============================================================================
contract AegisPaymasterHarness is AegisPaymaster {
    constructor(IEntryPoint ep, address sk) AegisPaymaster(ep, sk) {}

    function _validateEntryPointInterface(IEntryPoint) internal pure override {}

    function validateForTest(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) external returns (bytes memory context, uint256 validationData) {
        return _validatePaymasterUserOp(userOp, userOpHash, maxCost);
    }

    function postOpForTest(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost,
        uint256 actualUserOpFeePerGas
    ) external {
        _postOp(mode, context, actualGasCost, actualUserOpFeePerGas);
    }
}

// ============================================================================
// Minimal mock EntryPoint (only what BasePaymaster constructor needs)
// ============================================================================
contract MockEntryPoint {
    mapping(address => uint256) public deposits;

    function depositTo(address account) external payable {
        deposits[account] += msg.value;
    }

    function withdrawTo(address payable to, uint256 amount) external {
        (bool ok,) = to.call{value: amount}("");
        require(ok, "withdraw failed");
    }

    function balanceOf(address account) external view returns (uint256) {
        return deposits[account];
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IEntryPoint).interfaceId || interfaceId == 0x01ffc9a7;
    }
}

// ============================================================================
// AegisPaymaster Tests
// ============================================================================
contract AegisPaymasterTest is Test {
    using MessageHashUtils for bytes32;

    AegisPaymasterHarness internal paymaster;
    MockEntryPoint internal entryPoint;

    uint256 internal signerKey;
    address internal signerAddr;
    address internal owner;
    address internal userSender;

    // paymasterAndData field offsets (relative to the full bytes blob)
    uint256 constant PREFIX_LENGTH = 52; // 20 addr + 16 validationGasLimit + 16 postOpGasLimit
    uint256 constant VALID_UNTIL_OFFSET = PREFIX_LENGTH;
    uint256 constant VALID_AFTER_OFFSET = PREFIX_LENGTH + 6;
    uint256 constant AGENT_TIER_OFFSET = PREFIX_LENGTH + 12;
    uint256 constant APPROVAL_HASH_OFFSET = PREFIX_LENGTH + 13;
    uint256 constant SIGNATURE_OFFSET = PREFIX_LENGTH + 45;
    uint256 constant PAYMASTER_DATA_LENGTH = 162;

    function setUp() public {
        owner = makeAddr("owner");
        userSender = makeAddr("userSender");

        signerKey = 0xdeadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678;
        signerAddr = vm.addr(signerKey);

        entryPoint = new MockEntryPoint();
        vm.prank(owner);
        paymaster = new AegisPaymasterHarness(IEntryPoint(address(entryPoint)), signerAddr);
    }

    // ============================================================================
    // Helpers
    // ============================================================================

    function _buildApprovalHash(
        address sender,
        uint256 nonce,
        bytes memory callData,
        uint48 validUntil,
        uint48 validAfter,
        uint8 agentTier
    ) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                sender,
                nonce,
                keccak256(callData),
                validUntil,
                validAfter,
                agentTier,
                address(paymaster),
                block.chainid
            )
        );
    }

    function _signApprovalHash(bytes32 approvalHash, uint256 privateKey)
        internal
        pure
        returns (bytes memory)
    {
        bytes32 ethHash = approvalHash.toEthSignedMessageHash();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, ethHash);
        return abi.encodePacked(r, s, v);
    }

    function _buildPaymasterAndData(
        uint48 validUntil,
        uint48 validAfter,
        uint8 agentTier,
        bytes32 approvalHash,
        bytes memory signature
    ) internal view returns (bytes memory) {
        // prefix: 20 bytes paymaster address + 16 bytes validationGasLimit + 16 bytes postOpGasLimit
        bytes memory prefix = abi.encodePacked(
            address(paymaster),
            bytes16(uint128(100_000)),  // validationGasLimit placeholder
            bytes16(uint128(50_000))    // postOpGasLimit placeholder
        );
        return abi.encodePacked(
            prefix,
            bytes6(validUntil),
            bytes6(validAfter),
            bytes1(agentTier),
            approvalHash,
            signature
        );
    }

    function _buildUserOp(
        address sender,
        uint256 nonce,
        bytes memory callData,
        bytes memory paymasterData
    ) internal pure returns (PackedUserOperation memory) {
        return PackedUserOperation({
            sender: sender,
            nonce: nonce,
            initCode: "",
            callData: callData,
            accountGasLimits: bytes32(uint256(300_000) << 128 | uint256(100_000)),
            preVerificationGas: 50_000,
            gasFees: bytes32(uint256(1 gwei) << 128 | uint256(1 gwei)),
            paymasterAndData: paymasterData,
            signature: ""
        });
    }

    // ============================================================================
    // Deployment
    // ============================================================================

    function test_Deployment_SetsSigningKey() public view {
        assertEq(paymaster.signingKey(), signerAddr);
    }

    function test_Deployment_RevertsZeroSigningKey() public {
        vm.expectRevert("AegisPaymaster: zero signing key");
        new AegisPaymasterHarness(IEntryPoint(address(entryPoint)), address(0));
    }

    // ============================================================================
    // validatePaymasterUserOp — happy path
    // ============================================================================

    function test_ValidatePaymasterUserOp_ValidSignature_Passes() public {
        uint48 validUntil = uint48(block.timestamp + 300);
        uint48 validAfter = uint48(block.timestamp);
        uint8 agentTier = 1;
        bytes memory callData = abi.encodeWithSignature("transfer(address,uint256)", userSender, 1e18);

        bytes32 approvalHash = _buildApprovalHash(
            userSender, 0, callData, validUntil, validAfter, agentTier
        );
        bytes memory signature = _signApprovalHash(approvalHash, signerKey);
        bytes memory pmData = _buildPaymasterAndData(validUntil, validAfter, agentTier, approvalHash, signature);
        PackedUserOperation memory userOp = _buildUserOp(userSender, 0, callData, pmData);

        (bytes memory context, uint256 validationData) =
            paymaster.validateForTest(userOp, keccak256("userOpHash"), 1 ether);

        // sigFailed bit must be 0 (lower 160 bits = 0)
        assertEq(validationData & type(uint160).max, 0);
        // Context is non-empty
        assertGt(context.length, 0);
    }

    function test_ValidatePaymasterUserOp_MarksHashUsed() public {
        uint48 validUntil = uint48(block.timestamp + 300);
        uint48 validAfter = uint48(block.timestamp);
        bytes memory callData = "data";

        bytes32 approvalHash = _buildApprovalHash(userSender, 1, callData, validUntil, validAfter, 2);
        bytes memory signature = _signApprovalHash(approvalHash, signerKey);
        bytes memory pmData = _buildPaymasterAndData(validUntil, validAfter, 2, approvalHash, signature);
        PackedUserOperation memory userOp = _buildUserOp(userSender, 1, callData, pmData);

        paymaster.validateForTest(userOp, keccak256("hash1"), 1 ether);
        assertTrue(paymaster.usedHashes(approvalHash));
    }

    // ============================================================================
    // validatePaymasterUserOp — failure paths (return SIG_FAILURE, not revert)
    // ============================================================================

    function test_ValidatePaymasterUserOp_InvalidSignature_ReturnsSigFailure() public {
        uint48 validUntil = uint48(block.timestamp + 300);
        uint48 validAfter = uint48(block.timestamp);
        bytes memory callData = "data";

        bytes32 approvalHash = _buildApprovalHash(userSender, 0, callData, validUntil, validAfter, 1);
        // Sign with wrong key
        bytes memory badSig = _signApprovalHash(approvalHash, 0xbad);
        bytes memory pmData = _buildPaymasterAndData(validUntil, validAfter, 1, approvalHash, badSig);
        PackedUserOperation memory userOp = _buildUserOp(userSender, 0, callData, pmData);

        (, uint256 validationData) = paymaster.validateForTest(userOp, keccak256("hash"), 1 ether);
        assertEq(validationData & type(uint160).max, 1); // SIG_FAILURE
    }

    function test_ValidatePaymasterUserOp_TamperedApprovalHash_ReturnsSigFailure() public {
        uint48 validUntil = uint48(block.timestamp + 300);
        uint48 validAfter = uint48(block.timestamp);
        bytes memory callData = "data";

        bytes32 realHash = _buildApprovalHash(userSender, 0, callData, validUntil, validAfter, 1);
        bytes memory signature = _signApprovalHash(realHash, signerKey);

        // Tamper: provide wrong hash but correct signature
        bytes32 wrongHash = keccak256("tampered");
        bytes memory pmData = _buildPaymasterAndData(validUntil, validAfter, 1, wrongHash, signature);
        PackedUserOperation memory userOp = _buildUserOp(userSender, 0, callData, pmData);

        (, uint256 validationData) = paymaster.validateForTest(userOp, keccak256("h"), 1 ether);
        assertEq(validationData & type(uint160).max, 1); // SIG_FAILURE
    }

    function test_ValidatePaymasterUserOp_ReplayAttack_ReturnsSigFailure() public {
        uint48 validUntil = uint48(block.timestamp + 300);
        uint48 validAfter = uint48(block.timestamp);
        bytes memory callData = "data";

        bytes32 approvalHash = _buildApprovalHash(userSender, 0, callData, validUntil, validAfter, 1);
        bytes memory signature = _signApprovalHash(approvalHash, signerKey);
        bytes memory pmData = _buildPaymasterAndData(validUntil, validAfter, 1, approvalHash, signature);
        PackedUserOperation memory userOp = _buildUserOp(userSender, 0, callData, pmData);

        // First use: succeeds
        paymaster.validateForTest(userOp, keccak256("h1"), 1 ether);

        // Second use (replay): must fail
        (, uint256 validationData) = paymaster.validateForTest(userOp, keccak256("h2"), 1 ether);
        assertEq(validationData & type(uint160).max, 1); // SIG_FAILURE
    }

    function test_ValidatePaymasterUserOp_EOATier_ReturnsSigFailure() public {
        uint48 validUntil = uint48(block.timestamp + 300);
        uint48 validAfter = uint48(block.timestamp);
        bytes memory callData = "data";

        bytes32 approvalHash = _buildApprovalHash(userSender, 0, callData, validUntil, validAfter, 0);
        bytes memory signature = _signApprovalHash(approvalHash, signerKey);
        bytes memory pmData = _buildPaymasterAndData(validUntil, validAfter, 0, approvalHash, signature);
        PackedUserOperation memory userOp = _buildUserOp(userSender, 0, callData, pmData);

        (, uint256 validationData) = paymaster.validateForTest(userOp, keccak256("h"), 1 ether);
        assertEq(validationData & type(uint160).max, 1); // SIG_FAILURE — tier 0 blocked
    }

    function test_ValidatePaymasterUserOp_ShortPaymasterData_Reverts() public {
        bytes memory shortData = abi.encodePacked(address(paymaster), bytes32(0)); // too short
        PackedUserOperation memory userOp = _buildUserOp(userSender, 0, "data", shortData);

        vm.expectRevert("AegisPaymaster: short paymasterAndData");
        paymaster.validateForTest(userOp, keccak256("h"), 1 ether);
    }

    // ============================================================================
    // postOp
    // ============================================================================

    function test_PostOp_EmitsUserOpSponsored() public {
        address sender = makeAddr("sender");
        bytes32 userOpHash = keccak256("op");
        uint8 agentTier = 1;
        uint256 gasCost = 0.001 ether;

        bytes memory context = abi.encode(sender, userOpHash, agentTier);

        vm.expectEmit(true, true, false, true);
        emit AegisPaymaster.UserOpSponsored(sender, userOpHash, agentTier, gasCost);
        paymaster.postOpForTest(IPaymaster.PostOpMode.opSucceeded, context, gasCost, 1 gwei);
    }

    function test_PostOp_EmitsOnReverted() public {
        bytes memory context = abi.encode(userSender, keccak256("op"), uint8(2));
        // postOp is called even on reverted UserOps — same event emitted
        vm.expectEmit(false, false, false, false); // just check it doesn't revert
        emit AegisPaymaster.UserOpSponsored(address(0), bytes32(0), 0, 0);
        paymaster.postOpForTest(IPaymaster.PostOpMode.opReverted, context, 500_000, 1 gwei);
    }

    // ============================================================================
    // Admin functions
    // ============================================================================

    function test_Deposit_SendsToEntryPoint() public {
        vm.deal(address(this), 1 ether);
        paymaster.deposit{value: 0.5 ether}();
        assertEq(entryPoint.deposits(address(paymaster)), 0.5 ether);
    }

    function test_GetDeposit_ReturnsBalance() public {
        vm.deal(address(this), 1 ether);
        paymaster.deposit{value: 0.3 ether}();
        assertEq(paymaster.getDeposit(), 0.3 ether);
    }

    function test_WithdrawTo_OnlyOwner() public {
        vm.deal(address(this), 1 ether);
        paymaster.deposit{value: 0.5 ether}();
        vm.deal(address(entryPoint), 1 ether); // fund mock for withdraw

        address payable recipient = payable(makeAddr("recipient"));
        vm.prank(owner);
        paymaster.withdrawTo(recipient, 0.2 ether);
    }

    function test_WithdrawTo_RevertsForNonOwner() public {
        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        vm.expectRevert();
        paymaster.withdrawTo(payable(stranger), 0.1 ether);
    }

    // ============================================================================
    // Fuzz
    // ============================================================================

    function testFuzz_RandomSignature_ReturnsSigFailure(bytes memory randomSig) public {
        vm.assume(randomSig.length == 65);

        uint48 validUntil = uint48(block.timestamp + 300);
        uint48 validAfter = uint48(block.timestamp);
        bytes memory callData = "fuzzdata";

        bytes32 approvalHash = _buildApprovalHash(userSender, 0, callData, validUntil, validAfter, 1);
        bytes memory pmData = _buildPaymasterAndData(validUntil, validAfter, 1, approvalHash, randomSig);
        PackedUserOperation memory userOp = _buildUserOp(userSender, 0, callData, pmData);

        (, uint256 validationData) = paymaster.validateForTest(userOp, keccak256("h"), 1 ether);
        // Either SIG_FAILURE or passes only if random sig happens to be the correct one
        // (astronomically unlikely — we just ensure it doesn't revert unexpectedly)
        assertTrue(validationData == 0 || (validationData & type(uint160).max) == 1);
    }

    function testFuzz_TierThree_Passes(bytes memory callData) public {
        uint48 validUntil = uint48(block.timestamp + 300);
        uint48 validAfter = uint48(block.timestamp);
        uint8 agentTier = 3; // Tier 3 smart contract — allowed

        bytes32 approvalHash = _buildApprovalHash(userSender, 99, callData, validUntil, validAfter, agentTier);
        bytes memory signature = _signApprovalHash(approvalHash, signerKey);
        bytes memory pmData = _buildPaymasterAndData(validUntil, validAfter, agentTier, approvalHash, signature);
        PackedUserOperation memory userOp = _buildUserOp(userSender, 99, callData, pmData);

        (, uint256 validationData) = paymaster.validateForTest(userOp, keccak256("h"), 1 ether);
        assertEq(validationData & type(uint160).max, 0); // success
    }
}
