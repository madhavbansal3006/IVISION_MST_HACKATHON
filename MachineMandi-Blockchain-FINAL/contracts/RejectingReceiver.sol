// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title RejectingReceiver
 * @notice Minimal test helper contract that deliberately rejects incoming native token transfers.
 */
contract RejectingReceiver {
    error PaymentRejected();

    receive() external payable {
        revert PaymentRejected();
    }

    fallback() external payable {
        revert PaymentRejected();
    }
}
