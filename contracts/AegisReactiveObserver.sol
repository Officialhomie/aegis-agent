// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * Aegis Reactive Observer - Reactive Network Integration
 *
 * Subscribes to treasury/contract events and emits Reacted when the Reactive Network
 * runtime calls react(). Webhook URL is NOT stored on-chain; off-chain indexer
 * maps this contract to the Aegis webhook.
 *
 * Access control:
 * - Owner: subscribe/unsubscribe, set Reactive runtime address
 * - react(): only callable by the configured Reactive Network runtime address
 */
contract AegisReactiveObserver {
    address public owner;
    address public pendingOwner;
    address public reactiveRuntime;

    struct Subscription {
        uint256 chainId;
        address target;
        string eventName;
        bool active;
    }
    Subscription[] public subscriptions;
    mapping(bytes32 => uint256) private _subscriptionIndex;

    event Subscribed(uint256 chainId, address indexed target, string eventName);
    event Unsubscribed(uint256 chainId, address indexed target, string eventName);
    event Reacted(uint256 chainId, string eventName, bytes eventData);
    event ReactiveRuntimeSet(address indexed previousRuntime, address indexed newRuntime);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error NotReactiveRuntime();
    error InvalidReactiveRuntime();
    error SubscriptionNotFound();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyReactiveRuntime() {
        if (reactiveRuntime == address(0) || msg.sender != reactiveRuntime) revert NotReactiveRuntime();
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function setReactiveRuntime(address _runtime) external onlyOwner {
        if (_runtime == address(0)) revert InvalidReactiveRuntime();
        address previous = reactiveRuntime;
        reactiveRuntime = _runtime;
        emit ReactiveRuntimeSet(previous, _runtime);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotOwner();
        address oldOwner = owner;
        owner = msg.sender;
        pendingOwner = address(0);
        emit OwnershipTransferred(oldOwner, msg.sender);
    }

    function _subKey(uint256 chainId, address target, string memory eventName) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(chainId, target, eventName));
    }

    function subscribe(uint256 chainId, address target, string calldata eventName) external onlyOwner {
        bytes32 key = _subKey(chainId, target, eventName);
        if (_subscriptionIndex[key] != 0) return;
        subscriptions.push(Subscription({ chainId: chainId, target: target, eventName: eventName, active: true }));
        _subscriptionIndex[key] = subscriptions.length;
        emit Subscribed(chainId, target, eventName);
    }

    function unsubscribe(uint256 chainId, address target, string calldata eventName) external onlyOwner {
        bytes32 key = _subKey(chainId, target, eventName);
        uint256 idx = _subscriptionIndex[key];
        if (idx == 0) revert SubscriptionNotFound();
        idx--;
        require(subscriptions[idx].active, "Already inactive");
        subscriptions[idx].active = false;
        _subscriptionIndex[key] = 0;
        emit Unsubscribed(chainId, target, eventName);
    }

    function getSubscriptionCount() external view returns (uint256) {
        return subscriptions.length;
    }

    /**
     * Called by Reactive Network runtime when a subscribed event occurs.
     * Emits Reacted so off-chain indexer can forward to Aegis webhook.
     */
    function react(bytes calldata eventData) external onlyReactiveRuntime {
        emit Reacted(block.chainid, "reactive", eventData);
    }
}
