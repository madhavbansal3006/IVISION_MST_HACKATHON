# MachineMandi Known Limitations & Architectural Boundaries

> **Classification**: Documented Boundaries of the Deployed Smart Contract  
> **Target Contract**: `MachineMandi.sol` (`0xac7F286057238bA05CC878A2d71dF265Fa1e9EEE`)  
> **Network**: MST Testnet (Chain ID `91562037`)

---

## 1. Feature Classification Matrix

| Feature / Capability | Status | Architectural Explanation |
| :--- | :---: | :--- |
| **Native Escrow Settlement** | **VERIFIED ON MST** | Native MST tokens are locked upon `createJob` and transferred to `job.payout` via low-level `.call` upon verified proof. |
| **EIP-712 WorkProof Verification** | **VERIFIED ON MST** | Pure 8-field EIP-712 struct hashing and 65-byte ECDSA recovery verified on MST Testnet. |
| **Immutable Node Configuration** | **IMPLEMENTED & TESTED** | There is no `updateNode()` method. If terms or hardware keys change, the owner must deactivate the old node and register a new one. |
| **Strict Single Proof per Job** | **IMPLEMENTED & TESTED** | `STATUS_COMPLETED` is terminal. A job cannot be split into incremental milestones or partial payouts. |
| **Monotonic Increasing Delta** | **IMPLEMENTED & TESTED** | Requires `postReading > preReading` and delta $\ge minDelta$. Sensors with bidirectional counters (e.g. temperature fluctuations) must map to cumulative work units. |
| **Native MST Only (No ERC-20)** | **IMPLEMENTED** | Escrow operates strictly in native MST currency. ERC-20 or ERC-777 token escrows are not supported in this contract version. |
| **Maximum Deadline Duration** | **IMPLEMENTED & TESTED** | Maximum job duration is capped at 30 days (`MAX_DEADLINE_DURATION`) to prevent indefinite capital locking. |
| **No In-Flight Job Cancellation** | **IMPLEMENTED** | Neither buyer nor seller can cancel an open job before the deadline expires. Funds are locked until proof submission or post-deadline refund. |
| **Dispute Resolution / Arbitrator** | **FUTURE IMPROVEMENT** | The protocol relies on cryptographic proof of telemetry delta. Subjective quality disputes are not handled on-chain. |
| **Multi-Machine Atomic Workflows** | **FUTURE IMPROVEMENT** | Each job binds exactly one machine node to one buyer. Multi-device chained manufacturing pipelines require coordinating multiple jobs off-chain. |

---

## 2. Operational Limitations

1. **Deadlines Bound to Block Timestamp**:
   - Time calculations rely on `block.timestamp`. On EVM chains, timestamps are determined by block producers within network-enforced drift bounds (typically a few seconds).
2. **Payout Wallet Gas Consumption**:
   - Escrow payouts use low-level `.call{value: amount}("")`. If the payout destination is a smart contract with complex fallback logic exceeding gas limits or rejecting ETH transfers, the settlement transaction will revert with `TransferFailed()`. Payout addresses should be standard EOA wallets or gas-efficient splitters.
3. **Hardware Enclave Reliance**:
   - The on-chain contract guarantees that the telemetry was signed by the registered `node.signer`. It does not verify the physical mechanical integrity of the machine itself (e.g., if the physical sensor was tampered with before measurement). That trust boundary is protected by the embedded hardware security architecture.
