// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@account-abstraction/interfaces/PackedUserOperation.sol";
import "@account-abstraction/interfaces/IEntryPoint.sol";

/**
 * Minimal ERC-4337 v0.7 smart account for Aegis demo purposes.
 *
 * Always accepts validation — used to demonstrate paymaster-sponsored
 * UserOps without requiring a production wallet like Safe or Kernel.
 *
 * Constructor: entryPoint = 0x0000000071727De22E5E9d8BAf0edAc6f37da032
 */
contract DemoAccount {
    IEntryPoint public immutable entryPoint;

    constructor(IEntryPoint _entryPoint) {
        entryPoint = _entryPoint;
    }

    /**
     * ERC-4337 account validation. Always returns 0 (success).
     * For paymaster-sponsored ops, missingAccountFunds is 0.
     */
    function validateUserOp(
        PackedUserOperation calldata,
        bytes32,
        uint256 missingAccountFunds
    ) external returns (uint256) {
        require(msg.sender == address(entryPoint), "DemoAccount: not entryPoint");
        if (missingAccountFunds > 0) {
            (bool ok,) = payable(msg.sender).call{value: missingAccountFunds}("");
            require(ok, "DemoAccount: prefund failed");
        }
        return 0; // SIG_VALIDATION_SUCCESS
    }

    /**
     * Execute a call on behalf of the account (called by EntryPoint after validation).
     */
    function execute(address dest, uint256 value, bytes calldata data) external {
        require(msg.sender == address(entryPoint), "DemoAccount: not entryPoint");
        (bool ok, bytes memory result) = dest.call{value: value}(data);
        if (!ok) {
            assembly {
                revert(add(result, 32), mload(result))
            }
        }
    }

    receive() external payable {}
}
