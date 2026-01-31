// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../AegisReactiveObserver.sol";

contract AegisReactiveObserverTest is Test {
    AegisReactiveObserver public observer;
    address public owner;
    address public runtime;
    address public user;

    function setUp() public {
        owner = address(this);
        runtime = makeAddr("runtime");
        user = makeAddr("user");
        observer = new AegisReactiveObserver();
    }

    function test_Deployment_SetsOwner() public view {
        assertEq(observer.owner(), owner);
        assertEq(observer.pendingOwner(), address(0));
        assertEq(observer.reactiveRuntime(), address(0));
    }

    function test_SetReactiveRuntime_OnlyOwner() public {
        vm.prank(owner);
        observer.setReactiveRuntime(runtime);
        assertEq(observer.reactiveRuntime(), runtime);
    }

    function test_SetReactiveRuntime_RevertsWhenNotOwner() public {
        vm.prank(user);
        vm.expectRevert(AegisReactiveObserver.NotOwner.selector);
        observer.setReactiveRuntime(runtime);
    }

    function test_SetReactiveRuntime_RevertsWhenZeroAddress() public {
        vm.expectRevert(AegisReactiveObserver.InvalidReactiveRuntime.selector);
        observer.setReactiveRuntime(address(0));
    }

    function test_Subscribe_OnlyOwner() public {
        observer.setReactiveRuntime(runtime);
        address target = makeAddr("target");
        observer.subscribe(84532, target, "Transfer");
        assertEq(observer.getSubscriptionCount(), 1);
    }

    function test_Unsubscribe_OnlyOwner() public {
        address target = makeAddr("target");
        observer.subscribe(84532, target, "Transfer");
        observer.unsubscribe(84532, target, "Transfer");
        assertEq(observer.getSubscriptionCount(), 1);
    }

    function test_React_OnlyReactiveRuntime() public {
        observer.setReactiveRuntime(runtime);
        vm.prank(runtime);
        observer.react("0x1234");
    }

    function test_React_RevertsWhenNotRuntime() public {
        observer.setReactiveRuntime(runtime);
        vm.prank(user);
        vm.expectRevert(AegisReactiveObserver.NotReactiveRuntime.selector);
        observer.react("0x1234");
    }

    function test_React_RevertsWhenRuntimeNotSet() public {
        vm.prank(user);
        vm.expectRevert(AegisReactiveObserver.NotReactiveRuntime.selector);
        observer.react("0x1234");
    }

    function test_TransferOwnership_TwoStep() public {
        address newOwner = makeAddr("newOwner");
        observer.transferOwnership(newOwner);
        assertEq(observer.pendingOwner(), newOwner);
        assertEq(observer.owner(), owner);
        vm.prank(newOwner);
        observer.acceptOwnership();
        assertEq(observer.owner(), newOwner);
        assertEq(observer.pendingOwner(), address(0));
    }

    function test_AcceptOwnership_RevertsWhenNotPendingOwner() public {
        address newOwner = makeAddr("newOwner");
        observer.transferOwnership(newOwner);
        vm.prank(user);
        vm.expectRevert(AegisReactiveObserver.NotOwner.selector);
        observer.acceptOwnership();
    }
}
