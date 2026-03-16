// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";

interface IDelegationRegistry {}

contract DeployDelegationRegistry is Script {
    function run() external {
        address aegisAgent = 0x7B9763b416F89aB9A2468d8E9f041C4542B5612f;
        vm.startBroadcast();
        bytes memory bytecode = abi.encodePacked(
            vm.getCode("AegisDelegationRegistry.sol:AegisDelegationRegistry"),
            abi.encode(aegisAgent)
        );
        address deployed;
        assembly {
            deployed := create(0, add(bytecode, 0x20), mload(bytecode))
        }
        require(deployed != address(0), "Deploy failed");
        console2.log("AegisDelegationRegistry deployed to:", deployed);
        vm.stopBroadcast();
    }
}
