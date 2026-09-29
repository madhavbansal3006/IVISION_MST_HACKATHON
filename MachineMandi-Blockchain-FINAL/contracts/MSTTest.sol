// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MSTTest {
    event Ping(address indexed sender, uint256 value);

    function ping() external payable {
        emit Ping(msg.sender, msg.value);
    }
}
